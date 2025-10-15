import { getAvailableGames, getGameStatus } from './gameDataService';
import { getSupabase } from '../supabaseClient';

type StatusCache = Map<string, string | null>;

const cachedStatuses: StatusCache = new Map();
let intervalHandle: NodeJS.Timeout | null = null;
let isSyncRunning = false;
let cacheHydrated = false;

const DEFAULT_POLL_INTERVAL_MS = 30_000;

function getPollInterval(): number {
  const raw = process.env.NFL_GAME_STATUS_POLL_MS;
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POLL_INTERVAL_MS;
  return parsed;
}

async function hydrateCache(): Promise<void> {
  if (cacheHydrated) return;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('nfl_games')
      .select('nfl_game_id, status');
    if (error) throw error;
    for (const row of data ?? []) {
      const id = row?.nfl_game_id;
      if (id === undefined || id === null) continue;
  const status = typeof row?.status === 'string' ? row.status.toUpperCase() : null;
  cachedStatuses.set(String(id), status);
    }
    cacheHydrated = true;
  } catch (err) {
    console.error('[nflGameStatusSync] failed to hydrate cache from supabase', err);
  }
}

async function fetchGameStatuses(): Promise<Array<{ nfl_game_id: number; status: string }>> {
  const gamesMap = await getAvailableGames();
  const entries = Object.entries(gamesMap);
  if (!entries.length) return [];

  const results = await Promise.all(
    entries.map(async ([gameIdRaw]) => {
      const trimmedId = gameIdRaw.trim();
      if (!trimmedId) return null;
      const status = await getGameStatus(trimmedId);
      const normalizedStatus = (status || '').trim();
      if (!normalizedStatus) return null;
      const upperStatus = normalizedStatus.toUpperCase();
      const numericId = Number(trimmedId);
      if (!Number.isFinite(numericId)) return null;
      return {
        nfl_game_id: numericId,
        status: upperStatus,
      };
    })
  );

  return results.filter((entry): entry is { nfl_game_id: number; status: string } => Boolean(entry));
}

async function performSync(): Promise<void> {
  if (isSyncRunning) return;
  isSyncRunning = true;
  try {
    await hydrateCache();
    const statusPayloads = await fetchGameStatuses();
    if (!statusPayloads.length) return;

    const updates = statusPayloads.filter(({ nfl_game_id, status }) => {
      const cacheKey = String(nfl_game_id);
      const previous = cachedStatuses.get(cacheKey);
      return previous !== status;
    });

    if (!updates.length) return;

    const supabase = getSupabase();
    const { error } = await supabase
      .from('nfl_games')
      .upsert(updates, { onConflict: 'nfl_game_id' });
    if (error) throw error;

    for (const { nfl_game_id, status } of updates) {
      cachedStatuses.set(String(nfl_game_id), status);
    }
  } catch (err) {
    console.error('[nflGameStatusSync] failed to sync NFL game statuses', err);
  } finally {
    isSyncRunning = false;
  }
}

export function startNflGameStatusSync(): void {
  if (intervalHandle) return;
  const intervalMs = getPollInterval();
  void performSync();
  intervalHandle = setInterval(() => {
    void performSync();
  }, intervalMs);
}

export function stopNflGameStatusSync(): void {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  isSyncRunning = false;
}
