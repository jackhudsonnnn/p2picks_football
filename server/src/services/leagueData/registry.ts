/**
 * League Data Provider Registry
 *
 * Central registry for league-specific data providers.
 * Routes requests to the appropriate provider based on league.
 */

import type { League } from '../../types/league';
import type { LeagueDataProvider } from './types';
import { nflDataProvider } from './nflProvider';
import { nbaDataProvider } from './nbaProvider';
import { u2pickDataProvider } from './u2pickProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Provider Registry
// ─────────────────────────────────────────────────────────────────────────────

const providers: Map<League, LeagueDataProvider> = new Map([
  ['NFL', nflDataProvider],
  ['NBA', nbaDataProvider],
  ['U2Pick', u2pickDataProvider],
]);

/**
 * Get the data provider for a specific league.
 * @throws Error if no provider is registered for the league.
 */
export function getLeagueProvider(league: League): LeagueDataProvider {
  const provider = providers.get(league);
  if (!provider) {
    throw new Error(`No data provider registered for league: ${league}`);
  }
  return provider;
}

/**
 * Check if a provider is registered for a league.
 */
export function hasLeagueProvider(league: League): boolean {
  return providers.has(league);
}

/**
 * Get all registered leagues.
 */
export function getRegisteredLeagues(): League[] {
  return Array.from(providers.keys());
}

/**
 * Register a new provider (useful for testing or adding new leagues).
 */
export function registerProvider(league: League, provider: LeagueDataProvider): void {
  providers.set(league, provider);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Exports
// ─────────────────────────────────────────────────────────────────────────────

export { nflDataProvider } from './nflProvider';
export { nbaDataProvider } from './nbaProvider';
export { u2pickDataProvider } from './u2pickProvider';
