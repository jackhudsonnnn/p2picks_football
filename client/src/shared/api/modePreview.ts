import { fetchJSON } from '@shared/utils/http';

export type ModePreviewPayload = {
  summary?: string;
  description?: string;
  secondary?: string;
  winningCondition?: string;
  options?: string[];
};

const previewCache = new Map<string, ModePreviewPayload>();

export function clearModePreviewCache(): void {
  previewCache.clear();
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
