import type { ModeOverview } from '@shared/types/modes';
import { fetchJSON } from '@data/clients/restClient';

import type { ModeConfigRecord, ModePreviewPayload } from '@shared/types/modes';
import type { League } from '@features/bets/types';

const previewCache = new Map<string, ModePreviewPayload>();

// Cache per league
const overviewsCache = new Map<League, ModeOverview[]>();
const inflightOverviews = new Map<League, Promise<ModeOverview[]>>();

function getStatsServerBase(): string {
  const raw = (import.meta.env.VITE_STATS_SERVER_URL as string | undefined) || 'http://localhost:5001';
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('VITE_STATS_SERVER_URL is required for mode config API calls');
  }
  return trimmed.replace(/\/$/, '');
}

/**
 * Fetch mode overviews for a specific league.
 */
export async function fetchModeOverviews(league: League, force = false): Promise<ModeOverview[]> {
  if (!force && overviewsCache.has(league)) {
    return overviewsCache.get(league)!;
  }
  if (!force && inflightOverviews.has(league)) {
    return inflightOverviews.get(league)!;
  }

  const promise = fetchJSON<ModeOverview[]>(`/api/leagues/${encodeURIComponent(league)}/modes/overviews`)
    .then((data) => {
      overviewsCache.set(league, data ?? []);
      return overviewsCache.get(league)!;
    })
    .finally(() => {
      inflightOverviews.delete(league);
    });

  inflightOverviews.set(league, promise);
  return promise;
}

export async function fetchModeConfigs(betIds: string[]): Promise<Record<string, ModeConfigRecord>> {
  if (!betIds.length) return {};
  const base = getStatsServerBase();
  const url = `${base}/api/mode-config/batch`;
  return fetchJSON<Record<string, ModeConfigRecord>>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ betIds }),
  });
}

export async function fetchModePreview(
  modeKey: string,
  config: Record<string, unknown>,
  leagueGameId?: string | null,
  betId?: string | null,
  league: League = 'U2Pick',
): Promise<ModePreviewPayload | null> {
  if (!modeKey) return null;

  const payloadConfig = { ...(config || {}) } as Record<string, unknown>;
  const gameId =
    leagueGameId ||
    (typeof payloadConfig.league_game_id === 'string' ? (payloadConfig.league_game_id as string) : undefined);

  if (gameId && !payloadConfig.league_game_id) {
    payloadConfig.league_game_id = gameId;
  }
  if (!payloadConfig.league) {
    payloadConfig.league = league;
  }

  const cacheKey = `${league}:${modeKey}:${JSON.stringify(payloadConfig)}:${betId ?? ''}`;
  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey)!;
  }

  const body: Record<string, unknown> = { config: payloadConfig };
  if (gameId) {
    body.league_game_id = gameId;
  }
  if (betId) {
    body.bet_id = betId;
  }

  // Use league-scoped endpoint
  const url = `/api/leagues/${encodeURIComponent(league)}/modes/${encodeURIComponent(modeKey)}/preview`;
  const data = await fetchJSON<ModePreviewPayload>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  previewCache.set(cacheKey, data);
  return data;
}
