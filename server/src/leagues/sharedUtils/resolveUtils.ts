/**
 * Shared Resolve Utilities
 *
 * Common utilities for determining resolution timing across all leagues.
 * This is the single source of truth for resolve-related helpers.
 */

import { getGameStatus, getGamePeriod } from '../../services/leagueData';
import type { League } from '../../types/league';
import { createLogger } from '../../utils/logger';

const logger = createLogger('resolveUtils');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_RESOLVE_AT = ['Halftime', 'End of Game'] as const;
export const DEFAULT_RESOLVE_AT = 'End of Game';

export type ResolveAt = (typeof ALLOWED_RESOLVE_AT)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines if the "resolve at" step should be skipped in the user config flow.
 * This is typically true when the game has already passed the earliest resolve point.
 *
 * @param league - The league identifier
 * @param gameId - The game ID to check
 * @returns true if the resolve step should be skipped
 */
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
    // Skip if at halftime or past it (period >= 3 for most sports)
    return (status === 'STATUS_HALFTIME') || (typeof period === 'number' && Number.isFinite(period) && period >= 3);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn({ league, gameId, error: errorMessage }, 'shouldSkipResolveStep error');
    return false;
  }
}

/**
 * Normalizes a resolve_at value to ensure it's one of the allowed values.
 *
 * @param value - The raw value to normalize
 * @param allowedValues - Array of allowed string values
 * @param fallback - Default value if normalization fails
 * @returns A valid resolve_at string
 */
export function normalizeResolveAt(
  value: unknown,
  allowedValues: readonly string[] = ALLOWED_RESOLVE_AT,
  fallback: string = DEFAULT_RESOLVE_AT,
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

/**
 * Checks if a resolve_at value is valid.
 */
export function isValidResolveAt(
  value: unknown,
  allowedValues: readonly string[] = ALLOWED_RESOLVE_AT,
): boolean {
  if (typeof value === 'string') {
    return allowedValues.includes(value.trim());
  }
  return false;
}
