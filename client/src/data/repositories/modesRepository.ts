import type { ModeOverview } from '@shared/types/modes';
import { fetchJSON } from '@data/clients/restClient';

import type { ModeConfigRecord, ModePreviewPayload } from '@shared/types/modes';

const previewCache = new Map<string, ModePreviewPayload>();

let cachedOverviews: ModeOverview[] | null = null;
let inflightOverviews: Promise<ModeOverview[]> | null = null;

function getStatsServerBase(): string {
  const raw = (import.meta.env.VITE_STATS_SERVER_URL as string | undefined) || 'http://localhost:5001';
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('VITE_STATS_SERVER_URL is required for mode config API calls');
  }
  return trimmed.replace(/\/$/, '');
}

export async function fetchModeOverviews(force = false): Promise<ModeOverview[]> {
  if (!force && cachedOverviews) {
    return cachedOverviews;
  }
  if (!force && inflightOverviews) {
    return inflightOverviews;
  }

  inflightOverviews = fetchJSON<ModeOverview[]>('/api/bet-modes/overviews')
    .then((data) => {
      cachedOverviews = data ?? [];
      return cachedOverviews;
    })
    .finally(() => {
      inflightOverviews = null;
    });

  return inflightOverviews;
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
  nflGameId?: string | null,
  betId?: string | null,
): Promise<ModePreviewPayload | null> {
  if (!modeKey) return null;

  const payloadConfig = { ...(config || {}) } as Record<string, unknown>;
  const gameId =
    nflGameId || (typeof payloadConfig.nfl_game_id === 'string' ? (payloadConfig.nfl_game_id as string) : undefined);

  if (gameId && !payloadConfig.nfl_game_id) {
    payloadConfig.nfl_game_id = gameId;
  }

  const cacheKey = `${modeKey}:${JSON.stringify(payloadConfig)}:${betId ?? ''}`;
  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey)!;
  }

  const body: Record<string, unknown> = { config: payloadConfig };
  if (gameId) {
    body.nfl_game_id = gameId;
  }
  if (betId) {
    body.bet_id = betId;
  }

  const data = await fetchJSON<ModePreviewPayload>(`/api/bet-modes/${encodeURIComponent(modeKey)}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  previewCache.set(cacheKey, data);
  return data;
}
