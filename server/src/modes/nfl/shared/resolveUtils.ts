import { getGameStatus, getGamePeriod } from '../../../services/leagueData';
import type { League } from '../../../types/league';

export async function shouldSkipResolveStep(
  league: League,
  gameId: string | null | undefined,
): Promise<boolean> {
  if (!gameId) return false;
  try {
    const [status, period] = await Promise.all([
      getGameStatus(league, gameId),
      getGamePeriod(league, gameId),
    ]);
    return (status === 'STATUS_HALFTIME') || (typeof period === 'number' && Number.isFinite(period) && period >= 3);
  } catch (err: any) {
    console.warn('[resolveUtils] shouldSkipResolveStep error', { gameId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export function normalizeResolveAt(
  value: unknown,
  allowedValues: readonly string[],
  fallback: string,
): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && allowedValues.includes(trimmed)) {
      return trimmed;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const numeric = String(value);
    if (allowedValues.includes(numeric)) {
      return numeric;
    }
  }
  return fallback;
}
