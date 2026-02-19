/**
 * BullMQ-based Bet Lifecycle Queue
 *
 * Replaces the in-process setTimeout/setInterval approach with BullMQ delayed
 * jobs.  Each bet gets exactly one delayed job (deduplicated by `jobId`), so
 * even across multiple server replicas only one process will fire the
 * transition.  A repeatable "catchup" job replaces the setInterval sweep.
 */

import { Queue, Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { getSupabaseAdmin } from '../../supabaseClient';
import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';
import { captureLiveInfoSnapshot } from '../../leagues/sharedUtils/liveInfoSnapshot';
import type { League } from '../../types/league';

const logger = createLogger('betLifecycleQueue');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TransitionJob {
  type: 'transition';
  betId: string;
}

interface CatchupJob {
  type: 'catchup';
}

type LifecycleJob = TransitionJob | CatchupJob;

interface LifecycleResult {
  type: string;
  betId?: string;
  result?: string;
  count?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_NAME = 'bet-lifecycle';
const FIRE_GRACE_MS = 250;
const TRANSITION_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 500;

function getRedisConnection(): ConnectionOptions {
  const parsed = new URL(env.REDIS_URL);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    ...(parsed.protocol === 'rediss:' && { tls: {} }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue & Worker
// ─────────────────────────────────────────────────────────────────────────────

let queue: Queue<LifecycleJob, LifecycleResult> | null = null;
let worker: Worker<LifecycleJob, LifecycleResult> | null = null;
let initialized = false;

async function processJob(job: Job<LifecycleJob, LifecycleResult>): Promise<LifecycleResult> {
  const { data } = job;

  switch (data.type) {
    case 'transition': {
      const result = await transitionBetToPending(data.betId);
      return { type: 'transition', betId: data.betId, result };
    }
    case 'catchup': {
      const count = await runCatchupCycle();
      return { type: 'catchup', count };
    }
    default: {
      const exhaustive: never = data;
      throw new Error(`Unknown lifecycle job type: ${(exhaustive as LifecycleJob).type}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic (ported from betLifecycleService)
// ─────────────────────────────────────────────────────────────────────────────

async function transitionBetToPending(betId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('transition_bet_to_pending', { p_bet_id: betId });
  if (error) {
    logger.error({ betId, error: error.message }, 'transition failed');
    throw error; // re-throw to trigger BullMQ retry
  }
  const result = typeof data === 'string' ? data : 'ok';
  if (result !== 'pending') {
    logger.debug({ betId, result }, 'transition result');
  }

  // The RPC washes the bet directly in SQL when there aren't enough
  // distinct guesses. Capture a live-info snapshot so the Information
  // Modal can still display historical data for these washed bets.
  if (result === 'washed_insufficient_participation') {
    captureLiveInfoSnapshotForInsufficientParticipation(betId);
  }

  return result;
}

/**
 * Fire-and-forget: capture a live-info snapshot for a bet that was washed
 * inside the `transition_bet_to_pending` RPC due to insufficient participation.
 */
function captureLiveInfoSnapshotForInsufficientParticipation(betId: string): void {
  (async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: betRow } = await supabase
        .from('bet_proposals')
        .select('mode_key, league, league_game_id')
        .eq('bet_id', betId)
        .maybeSingle();

      const modeKey = (betRow?.mode_key as string) ?? 'unknown';
      const league = ((betRow?.league as string) ?? 'U2Pick') as League;
      const leagueGameId = (betRow?.league_game_id as string | null) ?? null;

      await captureLiveInfoSnapshot({
        betId,
        modeKey,
        leagueGameId,
        league,
        trigger: 'washed',
        outcomeDetail: 'Not enough unique participant choices',
      });
    } catch (err) {
      logger.warn(
        { betId, error: err instanceof Error ? err.message : String(err) },
        'insufficient-participation snapshot capture failed',
      );
    }
  })();
}

async function runCatchupCycle(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('bet_proposals')
    .select('bet_id, close_time')
    .eq('bet_status', 'active')
    .lte('close_time', nowIso);

  if (error) {
    logger.error({ error: error.message }, 'catchup query failed');
    throw error;
  }
  if (!data || data.length === 0) return 0;

  let scheduled = 0;
  for (const row of data) {
    const betId = row?.bet_id;
    if (!betId || typeof betId !== 'string') continue;
    await enqueueTransition(betId, 0); // fire immediately
    scheduled++;
  }
  return scheduled;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the lifecycle queue: create the BullMQ queue + worker, hydrate
 * existing active bets, and register a repeatable catchup job.
 */
export async function startBetLifecycleQueue(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const connection = getRedisConnection();

  queue = new Queue<LifecycleJob, LifecycleResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: TRANSITION_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 2000 },
      removeOnFail: { age: 86400 },
    },
  });

  // Startup health probe — verifies Redis is reachable before creating worker
  try {
    await queue.getWaitingCount();
    logger.info({}, 'startup health probe passed');
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'startup health probe FAILED — Redis may be unreachable',
    );
    throw err;
  }

  worker = new Worker<LifecycleJob, LifecycleResult>(
    QUEUE_NAME,
    processJob,
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    logger.error({
      jobId: job?.id,
      data: job?.data,
      error: err.message,
      attempts: job?.attemptsMade,
    }, 'lifecycle job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'lifecycle worker error');
  });

  // Register repeatable catchup
  await queue.add(
    'catchup',
    { type: 'catchup' },
    {
      repeat: { every: env.BET_LIFECYCLE_CATCHUP_MS },
      jobId: 'lifecycle-catchup',
    },
  );

  // Hydrate existing active bets
  await hydrateActiveBets();

  logger.info({}, 'bet lifecycle queue started');
}

/**
 * Stop the lifecycle queue and worker gracefully.
 */
export async function stopBetLifecycleQueue(): Promise<void> {
  if (!initialized) return;
  initialized = false;

  const closePromises: Promise<void>[] = [];
  if (worker) {
    closePromises.push(worker.close());
    worker = null;
  }
  if (queue) {
    closePromises.push(queue.close());
    queue = null;
  }
  if (closePromises.length > 0) {
    await Promise.all(closePromises);
  }
  logger.info({}, 'bet lifecycle queue stopped');
}

/**
 * Schedule a bet transition as a delayed BullMQ job.
 * Deduplicated by `jobId` — safe to call multiple times for the same bet.
 */
export async function enqueueBetLifecycle(betId: string, closeTimeIso?: string | null): Promise<void> {
  if (!betId) return;
  const delay = computeDelay(closeTimeIso ?? null);
  await enqueueTransition(betId, delay);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeDelay(closeTimeIso: string | null): number {
  if (!closeTimeIso) return 0;
  const ms = Date.parse(closeTimeIso);
  if (!Number.isFinite(ms)) return 0;
  const delay = ms - Date.now() + FIRE_GRACE_MS;
  return Math.max(delay, 0);
}

async function enqueueTransition(betId: string, delay: number): Promise<void> {
  if (!queue) {
    logger.warn({ betId }, 'queue not started, cannot enqueue transition');
    return;
  }
  await queue.add(
    'transition',
    { type: 'transition', betId },
    {
      jobId: `lifecycle-${betId}`,
      delay: Math.max(delay, 0),
    },
  );
}

async function hydrateActiveBets(): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bet_proposals')
      .select('bet_id, close_time')
      .eq('bet_status', 'active');

    if (error) throw error;

    for (const row of data ?? []) {
      const betId = row?.bet_id;
      if (!betId || typeof betId !== 'string') continue;
      const closeTime = typeof row?.close_time === 'string' ? row.close_time : null;
      const delay = computeDelay(closeTime);
      await enqueueTransition(betId, delay);
    }

    logger.info({ count: data?.length ?? 0 }, 'hydrated active bets');
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'failed to hydrate active bets');
  }
}

/**
 * Check whether the lifecycle queue worker is alive.
 */
export function isLifecycleWorkerRunning(): boolean {
  return worker !== null && !worker.closing;
}
