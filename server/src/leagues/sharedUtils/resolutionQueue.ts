/**
 * Resolution Queue Service
 * 
 * Uses BullMQ to queue bet resolution operations for:
 * - Concurrency control (prevents overwhelming the database)
 * - Persistence (jobs survive server restarts)
 * - Automatic retries with exponential backoff
 * - Dead letter queue for failed jobs
 */

import { Queue, Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { betRepository } from './betRepository';
import { washBetWithHistory, type WashOptions } from './washService';
import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';

const logger = createLogger('resolutionQueue');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ResolutionJobType = 'set_winning_choice' | 'wash_bet' | 'record_history';

export interface SetWinningChoiceJob {
  type: 'set_winning_choice';
  betId: string;
  winningChoice: string;
  /** Optional history to record after successful resolution */
  history?: {
    eventType: string;
    payload: Record<string, unknown>;
  };
}

export interface WashBetJob {
  type: 'wash_bet';
  betId: string;
  payload: Record<string, unknown>;
  explanation: string;
  eventType: string;
  modeLabel: string;
}

export interface RecordHistoryJob {
  type: 'record_history';
  betId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export type ResolutionJob = SetWinningChoiceJob | WashBetJob | RecordHistoryJob;

export interface ResolutionResult {
  success: boolean;
  betId: string;
  type: ResolutionJobType;
  updated?: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_NAME = 'bet-resolution';

/** Default concurrency - how many jobs to process in parallel */
const DEFAULT_CONCURRENCY = 5;

/** Default retry attempts */
const DEFAULT_RETRY_ATTEMPTS = 3;

/** Backoff delay in ms (exponential: 1s, 2s, 4s) */
const BACKOFF_DELAY_MS = 1000;

function getRedisConnection(): ConnectionOptions {
  // Validation handled by Zod schema in config/env.ts
  const redisUrl = env.REDIS_URL;
  
  // Parse Redis URL for BullMQ connection options
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    // TLS for production Redis (e.g., Upstash, Redis Cloud)
    ...(parsed.protocol === 'rediss:' && { tls: {} }),
  };
}

function getConcurrency(): number {
  return env.RESOLUTION_QUEUE_CONCURRENCY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue & Worker
// ─────────────────────────────────────────────────────────────────────────────

let queue: Queue<ResolutionJob, ResolutionResult> | null = null;
let worker: Worker<ResolutionJob, ResolutionResult> | null = null;

/**
 * Process a resolution job.
 */
async function processJob(job: Job<ResolutionJob, ResolutionResult>): Promise<ResolutionResult> {
  const { data } = job;
  
  try {
    switch (data.type) {
      case 'set_winning_choice': {
        const updated = await betRepository.setWinningChoice(data.betId, data.winningChoice);
        
        // Record history if provided and resolution succeeded
        if (updated && data.history) {
          await betRepository.recordHistory(data.betId, data.history.eventType, data.history.payload);
        }
        
        return { success: true, betId: data.betId, type: data.type, updated };
      }
      
      case 'wash_bet': {
        await washBetWithHistory({
          betId: data.betId,
          payload: data.payload,
          explanation: data.explanation,
          eventType: data.eventType,
          modeLabel: data.modeLabel,
        });
        return { success: true, betId: data.betId, type: data.type };
      }
      
      case 'record_history': {
        await betRepository.recordHistory(data.betId, data.eventType, data.payload);
        return { success: true, betId: data.betId, type: data.type };
      }
      
      default: {
        const exhaustive: never = data;
        throw new Error(`Unknown job type: ${(exhaustive as ResolutionJob).type}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, data, error: message }, 'job failed');
    throw err; // Re-throw to trigger retry
  }
}

/**
 * Start the resolution queue and worker.
 */
export function startResolutionQueue(): void {
  if (queue && worker) {
    logger.warn({}, 'already started');
    return;
  }
  
  const connection = getRedisConnection();
  const concurrency = getConcurrency();
  
  queue = new Queue<ResolutionJob, ResolutionResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: DEFAULT_RETRY_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: BACKOFF_DELAY_MS,
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 1000, // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours
      },
    },
  });
  
  worker = new Worker<ResolutionJob, ResolutionResult>(
    QUEUE_NAME,
    processJob,
    { connection, concurrency },
  );
  
  worker.on('completed', (job, result) => {
    if (process.env.DEBUG_RESOLUTION_QUEUE === '1') {
      logger.info({ jobId: job.id, result }, 'job completed');
    }
  });
  
  worker.on('failed', (job, err) => {
    logger.error({ 
      jobId: job?.id, 
      betId: job?.data?.betId,
      type: job?.data?.type,
      error: err.message,
      attempts: job?.attemptsMade,
    }, 'job permanently failed');
  });
  
  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'worker error');
  });
  
  logger.info({ concurrency }, `started with concurrency=${concurrency}`);
}

/**
 * Stop the resolution queue and worker gracefully.
 */
export async function stopResolutionQueue(): Promise<void> {
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
    logger.info({}, 'stopped');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Enqueue Jobs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue a set winning choice job.
 * Returns immediately; the job will be processed asynchronously.
 */
export async function enqueueSetWinningChoice(
  betId: string, 
  winningChoice: string,
  history?: { eventType: string; payload: Record<string, unknown> },
): Promise<void> {
  if (!queue) {
    throw new Error('[resolutionQueue] queue not started');
  }
  
  await queue.add('set_winning_choice', {
    type: 'set_winning_choice',
    betId,
    winningChoice,
    history,
  }, {
    jobId: `resolve-${betId}`, // Dedupe: only one resolution job per bet
  });
}

/**
 * Enqueue a wash bet job.
 * Returns immediately; the job will be processed asynchronously.
 */
export async function enqueueWashBet(options: WashOptions): Promise<void> {
  if (!queue) {
    throw new Error('[resolutionQueue] queue not started');
  }
  
  await queue.add('wash_bet', {
    type: 'wash_bet',
    betId: options.betId,
    payload: options.payload,
    explanation: options.explanation,
    eventType: options.eventType,
    modeLabel: options.modeLabel,
  }, {
    jobId: `wash-${options.betId}`, // Dedupe: only one wash job per bet
  });
}

/**
 * Enqueue a record history job (for non-critical history that can be async).
 */
export async function enqueueRecordHistory(
  betId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!queue) {
    throw new Error('[resolutionQueue] queue not started');
  }
  
  await queue.add('record_history', {
    type: 'record_history',
    betId,
    eventType,
    payload,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue Status (for monitoring/health checks)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getQueueStatus(): Promise<QueueStatus | null> {
  if (!queue) return null;
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  
  return { waiting, active, completed, failed, delayed };
}
