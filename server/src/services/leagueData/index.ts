/**
 * League Data Abstraction Layer - Unified Accessors
 *
 * Provides a unified interface for accessing game data across all supported leagues.
 * These functions route to the appropriate league-specific provider.
 *
 * @example
 * ```typescript
 * import { getGameStatus, getHomeTeam, getPlayerStat } from './services/leagueData';
 *
 * // Get game status for any league
 * const status = await getGameStatus('NFL', 'game123');
 * const nbaStatus = await getGameStatus('NBA', 'game456');
 *
 * // Get team info
 * const homeTeam = await getHomeTeam('NFL', 'game123');
 *
 * // Get player stat
 * const yards = await getPlayerStat('NFL', 'game123', 'player456', 'passing', 'passingYards');
 * const points = await getPlayerStat('NBA', 'game456', 'player789', 'stats', 'points');
 * ```
 */

import type { League } from '../../types/league';
import type {
  LeagueTeam,
  LeaguePlayer,
  PlayerRecord,
  GameStatus,
  GameScores,
  GameMatchup,
  GameInfo,
} from './types';
import { getLeagueProvider, hasLeagueProvider } from './registry';

// Re-export types
export type {
  LeagueDataProvider,
  LeagueTeam,
  LeaguePlayer,
  PlayerRecord,
  GameStatus,
  GameScores,
  GameMatchup,
  GameInfo,
} from './types';

// Re-export registry functions
export {
  getLeagueProvider,
  hasLeagueProvider,
  getRegisteredLeagues,
  registerProvider,
} from './registry';

// Re-export feeds module
export * from './feeds';

// Re-export kernel module
export {
  LeagueKernel,
  getKernel,
  startLeagueKernel,
  stopLeagueKernel,
  startLeagueKernels,
  stopAllKernels,
  getRunningKernels,
  isKernelRunning,
  startModeRuntime,
  stopModeRuntime,
  getModeRuntimeStatus,
  isModeRuntimeInitialized,
} from './kernel';

// ─────────────────────────────────────────────────────────────────────────────
// Game Status & Info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get game status for any league.
 */
export async function getGameStatus(league: League, gameId: string): Promise<GameStatus> {
  const provider = getLeagueProvider(league);
  return provider.getGameStatus(gameId);
}

/**
 * Get game period/quarter for any league.
 */
export async function getGamePeriod(league: League, gameId: string): Promise<number | null> {
  const provider = getLeagueProvider(league);
  return provider.getGamePeriod(gameId);
}

/**
 * Get matchup string (e.g., "BUF vs BAL") for any league.
 */
export async function getMatchup(league: League, gameId: string): Promise<string> {
  const provider = getLeagueProvider(league);
  return provider.getMatchup(gameId);
}

/**
 * Get full game info including status, teams, and scores.
 */
export async function getGameInfo(league: League, gameId: string): Promise<GameInfo> {
  const provider = getLeagueProvider(league);
  const [status, period, homeTeam, awayTeam] = await Promise.all([
    provider.getGameStatus(gameId),
    provider.getGamePeriod(gameId),
    provider.getHomeTeam(gameId),
    provider.getAwayTeam(gameId),
  ]);
  
  return {
    gameId,
    league,
    status,
    period,
    homeTeam,
    awayTeam,
  };
}

/**
 * Get available games for a league.
 */
export async function getAvailableGames(league: League): Promise<Record<string, string>> {
  const provider = getLeagueProvider(league);
  return provider.getAvailableGames();
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get home team for any league.
 */
export async function getHomeTeam(league: League, gameId: string): Promise<LeagueTeam | null> {
  const provider = getLeagueProvider(league);
  return provider.getHomeTeam(gameId);
}

/**
 * Get away team for any league.
 */
export async function getAwayTeam(league: League, gameId: string): Promise<LeagueTeam | null> {
  const provider = getLeagueProvider(league);
  return provider.getAwayTeam(gameId);
}

/**
 * Get all teams for any league.
 */
export async function getAllTeams(league: League, gameId: string): Promise<LeagueTeam[]> {
  const provider = getLeagueProvider(league);
  return provider.getAllTeams(gameId);
}

/**
 * Get a specific team by ID for any league.
 */
export async function getTeam(league: League, gameId: string, teamId: string): Promise<LeagueTeam | null> {
  const provider = getLeagueProvider(league);
  return provider.getTeam(gameId, teamId);
}

/**
 * Get home team name for any league.
 */
export async function getHomeTeamName(league: League, gameId: string): Promise<string> {
  const team = await getHomeTeam(league, gameId);
  return team?.displayName || 'home';
}

/**
 * Get away team name for any league.
 */
export async function getAwayTeamName(league: League, gameId: string): Promise<string> {
  const team = await getAwayTeam(league, gameId);
  return team?.displayName || 'away';
}

// ─────────────────────────────────────────────────────────────────────────────
// Scores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all scores for any league.
 */
export async function getScores(league: League, gameId: string): Promise<GameScores> {
  const provider = getLeagueProvider(league);
  return provider.getScores(gameId);
}

/**
 * Get home score for any league.
 */
export async function getHomeScore(league: League, gameId: string): Promise<number> {
  const provider = getLeagueProvider(league);
  return provider.getHomeScore(gameId);
}

/**
 * Get away score for any league.
 */
export async function getAwayScore(league: League, gameId: string): Promise<number> {
  const provider = getLeagueProvider(league);
  return provider.getAwayScore(gameId);
}

/**
 * Get total combined score for any league.
 */
export async function getTotalScore(league: League, gameId: string): Promise<number> {
  const provider = getLeagueProvider(league);
  return provider.getTotalScore(gameId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all players for any league.
 */
export async function getAllPlayers(league: League, gameId: string): Promise<LeaguePlayer[]> {
  const provider = getLeagueProvider(league);
  return provider.getAllPlayers(gameId);
}

/**
 * Get a specific player by ID for any league.
 */
export async function getPlayer(league: League, gameId: string, playerId: string): Promise<LeaguePlayer | null> {
  const provider = getLeagueProvider(league);
  return provider.getPlayer(gameId, playerId);
}

/**
 * Get all player records for any league.
 */
export async function getAllPlayerRecords(league: League, gameId: string): Promise<PlayerRecord[]> {
  const provider = getLeagueProvider(league);
  return provider.getAllPlayerRecords(gameId);
}

/**
 * Get a specific player stat for any league.
 *
 * @param league - League identifier
 * @param gameId - Game identifier
 * @param playerId - Player identifier (ID or name:PlayerName)
 * @param category - Stat category (e.g., 'passing', 'stats')
 * @param field - Stat field within category (e.g., 'passingYards', 'points')
 */
export async function getPlayerStat(
  league: League,
  gameId: string,
  playerId: string,
  category: string,
  field: string,
): Promise<number | null> {
  const provider = getLeagueProvider(league);
  return provider.getPlayerStat(gameId, playerId, category, field);
}

// ─────────────────────────────────────────────────────────────────────────────
// Possession (NFL-specific, but exposed for all)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get possession team ID. Only supported for NFL.
 */
export async function getPossessionTeamId(league: League, gameId: string): Promise<string | null> {
  const provider = getLeagueProvider(league);
  if (provider.getPossessionTeamId) {
    return provider.getPossessionTeamId(gameId);
  }
  return null;
}

/**
 * Get possession team name. Only supported for NFL.
 */
export async function getPossessionTeamName(league: League, gameId: string): Promise<string | null> {
  const provider = getLeagueProvider(league);
  if (provider.getPossessionTeamName) {
    return provider.getPossessionTeamName(gameId);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Extraction Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract team ID from a LeagueTeam object.
 */
export function extractTeamId(team: LeagueTeam | null | undefined): string | null {
  if (!team) return null;
  return team.teamId || null;
}

/**
 * Extract display name from a LeagueTeam object.
 */
export function extractTeamName(team: LeagueTeam | null | undefined): string | null {
  if (!team) return null;
  return team.displayName || null;
}

/**
 * Extract abbreviation from a LeagueTeam object.
 */
export function extractTeamAbbreviation(team: LeagueTeam | null | undefined): string | null {
  if (!team) return null;
  return team.abbreviation || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invalidate cache for a specific game.
 */
export function invalidateCache(league: League, gameId: string): void {
  if (hasLeagueProvider(league)) {
    const provider = getLeagueProvider(league);
    provider.invalidateCache(gameId);
  }
}

/**
 * Clear all cache for a specific league.
 */
export function clearCache(league: League): void {
  if (hasLeagueProvider(league)) {
    const provider = getLeagueProvider(league);
    provider.clearCache();
  }
}

/**
 * Clear all cache for all leagues.
 */
export function clearAllCaches(): void {
  const { getRegisteredLeagues } = require('./registry');
  for (const league of getRegisteredLeagues()) {
    clearCache(league);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a category from a stats-by-category object.
 * Performs case-insensitive matching.
 */
export function getCategory(
  statsByCategory: Record<string, Record<string, unknown>> | null | undefined,
  category: string,
): Record<string, unknown> | undefined {
  if (!statsByCategory) return undefined;
  const direct = (statsByCategory as any)[category];
  if (direct) return direct;
  const lower = category.toLowerCase();
  for (const [k, v] of Object.entries(statsByCategory)) {
    if (k.toLowerCase() === lower) return v as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Alias for getAllTeams (backwards compatibility)
 */
export async function listTeams(league: League, gameId: string): Promise<LeagueTeam[]> {
  return getAllTeams(league, gameId);
}
