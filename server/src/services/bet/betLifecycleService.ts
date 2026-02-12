import { getSupabaseAdmin } from '../../supabaseClient';
import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';

const logger = createLogger('betLifecycleService');

const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const FIRE_GRACE_MS = 250;
const BET_LIFECYCLE_CATCHUP_MS = env.BET_LIFECYCLE_CATCHUP_MS;

const scheduledTimers = new Map<string, NodeJS.Timeout>();
const inFlightTransitions = new Set<string>();
let catchupHandle: NodeJS.Timeout | null = null;
let initialized = false;

export function startBetLifecycleService(): void {
  if (initialized) return;
  initialized = true;
  void hydrateActiveBets();
  catchupHandle = setInterval(() => {
    void runCatchupCycle();
  }, BET_LIFECYCLE_CATCHUP_MS);
}

export function stopBetLifecycleService(): void {
  if (!initialized) return;
  initialized = false;
  for (const timer of scheduledTimers.values()) {
    clearTimeout(timer);
  }
  scheduledTimers.clear();
  if (catchupHandle) {
    clearInterval(catchupHandle);
    catchupHandle = null;
  }
}

export function registerBetLifecycle(betId: string, closeTimeIso?: string | null): void {
  if (!betId) return;
  scheduleBetTransition(betId, closeTimeIso ?? null);
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
      scheduleBetTransition(betId, closeTime);
    }
    await runCatchupCycle();
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'failed to hydrate active bets');
  }
}

function scheduleBetTransition(betId: string, closeTimeIso: string | null): void {
  if (scheduledTimers.has(betId)) {
    clearTimeout(scheduledTimers.get(betId)!);
    scheduledTimers.delete(betId);
  }
  const fireAt = parseCloseTime(closeTimeIso);
  if (fireAt === null) {
    return;
  }
  const delay = fireAt - Date.now() + FIRE_GRACE_MS;
  if (delay <= 0) {
    void transitionBetToPending(betId);
    return;
  }
  const timeoutDelay = Math.min(delay, MAX_TIMEOUT_MS);
  const handle = setTimeout(() => {
    scheduledTimers.delete(betId);
    void transitionBetToPending(betId);
  }, timeoutDelay);
  scheduledTimers.set(betId, handle);
}

function parseCloseTime(closeTimeIso: string | null): number | null {
  if (!closeTimeIso) return null;
  const ms = Date.parse(closeTimeIso);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

async function transitionBetToPending(betId: string): Promise<void> {
  if (inFlightTransitions.has(betId)) return;
  inFlightTransitions.add(betId);
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('transition_bet_to_pending', { p_bet_id: betId });
    if (error) {
      logger.error({ betId, error: error.message }, 'transition failed');
      return;
    }
    if (data && typeof data === 'string' && data !== 'pending') {
      logger.debug({ betId, result: data }, 'transition result');
    }
  } catch (err) {
    logger.error({ betId, error: err instanceof Error ? err.message : String(err) }, 'transition exception');
  } finally {
    inFlightTransitions.delete(betId);
  }
}

async function runCatchupCycle(): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('bet_proposals')
      .select('bet_id, close_time')
      .eq('bet_status', 'active')
      .lte('close_time', nowIso);
    if (error) throw error;
    if (!data || data.length === 0) return;
    for (const row of data) {
      const betId = row?.bet_id;
      if (!betId || typeof betId !== 'string') continue;
      if (scheduledTimers.has(betId)) {
        clearTimeout(scheduledTimers.get(betId)!);
        scheduledTimers.delete(betId);
      }
      void transitionBetToPending(betId);
    }
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'catchup cycle failed');
  }
}
