import { getSupabaseAdmin } from '../../supabaseClient';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const FIRE_GRACE_MS = 250;
const DEFAULT_CATCHUP_INTERVAL_MS = 60_000;

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
  }, getCatchupInterval());
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

function getCatchupInterval(): number {
  const raw = process.env.BET_LIFECYCLE_CATCHUP_MS;
  if (!raw) return DEFAULT_CATCHUP_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CATCHUP_INTERVAL_MS;
  return parsed;
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
    console.error('[betLifecycle] failed to hydrate active bets', err);
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
      console.error('[betLifecycle] transition failed', { betId, error: error.message });
      return;
    }
    if (data && typeof data === 'string' && data !== 'pending') {
      console.debug('[betLifecycle] transition result', { betId, result: data });
    }
  } catch (err) {
    console.error('[betLifecycle] transition exception', { betId }, err);
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
    console.error('[betLifecycle] catchup cycle failed', err);
  }
}
