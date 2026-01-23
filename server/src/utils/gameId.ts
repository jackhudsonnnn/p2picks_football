/**
 * Game ID Abstraction Utilities
 *
 * Provides league-agnostic game ID handling for mode configs.
 * Uses `league_game_id` as the canonical key for all leagues.
 */

import type { League } from '../types/league';

/**
 * The canonical key for storing game IDs in config objects.
 */
const GAME_ID_KEY = 'league_game_id' as const;

/**
 * Extract game ID from a config object.
 */
export function extractGameId(config: Record<string, unknown>): string | null {
  const value = config[GAME_ID_KEY];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

/**
 * Extract game ID with a fallback value.
 */
export function extractGameIdOrFallback(
  config: Record<string, unknown>,
  fallback: string | null | undefined,
): string | null {
  return extractGameId(config) ?? (fallback?.trim() || null);
}

/**
 * Normalize a config object to use the canonical `league_game_id` key.
 * Optionally sets the game ID if provided and not already present.
 */
export function normalizeGameIdInConfig(
  config: Record<string, unknown>,
  gameIdFallback?: string | null,
): Record<string, unknown> {
  const result = { ...config };

  // Extract any existing game ID
  const existingGameId = extractGameId(result);

  // Apply fallback if no game ID exists
  if (!existingGameId && gameIdFallback?.trim()) {
    result.league_game_id = gameIdFallback.trim();
  }

  return result;
}

/**
 * Set the game ID in a config object using the canonical key.
 */
export function setGameIdInConfig(
  config: Record<string, unknown>,
  gameId: string | null,
): Record<string, unknown> {
  const result = { ...config };
  if (gameId?.trim()) {
    result.league_game_id = gameId.trim();
  }
  return result;
}

/**
 * Input type for user config builders - league-agnostic.
 */
export interface GameContextInput {
  /** Canonical game ID (league-agnostic) */
  leagueGameId?: string | null;
  /** League identifier */
  league?: League;
  /** Existing config state */
  config?: Record<string, unknown>;
}

/**
 * Resolve the effective game ID from various input sources.
 */
export function resolveGameId(input: GameContextInput): string | null {
  // Prefer explicit leagueGameId
  if (input.leagueGameId?.trim()) {
    return input.leagueGameId.trim();
  }
  // Check config object
  if (input.config) {
    return extractGameId(input.config);
  }
  return null;
}
