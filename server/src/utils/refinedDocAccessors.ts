/**
 * Centralized accessors for RefinedGameDoc data.
 * 
 * This module acts as a data access layer for refined NFL game data.
 * Instead of passing doc objects around, consumers call getters with a gameId.
 * Internally, documents are cached based on NFL_DATA_REFINED_INTERVAL_SECONDS
 * to avoid redundant file reads when multiple getters are called in sequence.
 */

import type { RefinedGameDoc, Team, Player, StatsByCategory } from './gameData';
import { loadRefinedGame, findTeam as baseFindTeam, findPlayer as baseFindPlayer, getCategory } from './gameData';

// ─────────────────────────────────────────────────────────────────────────────
// Cache Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface CachedDoc {
  doc: RefinedGameDoc;
  loadedAt: number;
}

const cache = new Map<string, CachedDoc>();

/** Cache TTL in ms - data only changes every NFL_DATA_REFINED_INTERVAL_SECONDS */
function getCacheTtlMs(): number {
  const seconds = Number(process.env.NFL_DATA_REFINED_INTERVAL_SECONDS) || 20;
  // Use 90% of the interval to ensure we refresh before stale
  return Math.max(5000, seconds * 900);
}

/**
 * Clear cached doc for a specific game (useful when you know data was just updated).
 */
export function invalidateCache(gameId: string): void {
  cache.delete(gameId);
}

/**
 * Clear entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Internal: Load doc from cache or disk.
 */
async function getCachedDoc(gameId: string): Promise<RefinedGameDoc | null> {
  const now = Date.now();
  const cached = cache.get(gameId);
  
  if (cached && (now - cached.loadedAt) < getCacheTtlMs()) {
    return cached.doc;
  }
  
  const doc = await loadRefinedGame(gameId);
  if (doc) {
    cache.set(gameId, { doc, loadedAt: now });
  } else {
    cache.delete(gameId);
  }
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status / Period
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get game status string (e.g., STATUS_IN_PROGRESS, STATUS_FINAL).
 */
export async function getGameStatus(gameId: string): Promise<string | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;
  const status = doc.status;
  if (typeof status === 'string' && status.trim().length) return status.trim();
  return null;
}

/**
 * Check if game status matches a given value (case-insensitive prefix match).
 */
export async function isGameStatus(gameId: string, expected: string): Promise<boolean> {
  const status = await getGameStatus(gameId);
  if (!status) return false;
  return status.toUpperCase().startsWith(expected.toUpperCase());
}

/**
 * Get current game period (quarter).
 */
export async function getGamePeriod(gameId: string): Promise<number | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;
  const period = doc.period;
  if (typeof period === 'number' && Number.isFinite(period)) return period;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a team by ID or abbreviation.
 */
export async function getTeam(gameId: string, teamId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;
  return baseFindTeam(doc, teamId);
}

/**
 * Get home team (homeAway === 'home' or displayOrder === 0).
 */
export async function getHomeTeam(gameId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  const byHomeAway = doc.teams.find((t) => (t as any).homeAway === 'home');
  if (byHomeAway) return byHomeAway;
  const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
  return sorted[0] ?? null;
}

/**
 * Get away team (homeAway === 'away' or displayOrder === 1).
 */
export async function getAwayTeam(gameId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  const byHomeAway = doc.teams.find((t) => (t as any).homeAway === 'away');
  if (byHomeAway) return byHomeAway;
  const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
  return sorted[1] ?? null;
}

/**
 * Get both teams as [home, away].
 */
export async function getTeams(gameId: string): Promise<[Team | null, Team | null]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [null, null];
  
  let home: Team | null = doc.teams.find((t) => (t as any).homeAway === 'home') ?? null;
  let away: Team | null = doc.teams.find((t) => (t as any).homeAway === 'away') ?? null;
  
  if (!home || !away) {
    const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
    home = home ?? sorted[0] ?? null;
    away = away ?? sorted[1] ?? null;
  }
  
  return [home, away];
}

/**
 * Get all teams from doc.
 */
export async function getAllTeams(gameId: string): Promise<Team[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams;
}

/**
 * Get opponent team for a given team ID.
 */
export async function getOpponentTeam(gameId: string, teamId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  return doc.teams.find((t) => (t as any).teamId !== teamId && (t as any).abbreviation !== teamId) ?? null;
}

/**
 * Get team currently in possession.
 */
export async function getPossessionTeam(gameId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  return doc.teams.find((t) => (t as any).possession === true) ?? null;
}

/**
 * Get possession team ID.
 */
export async function getPossessionTeamId(gameId: string): Promise<string | null> {
  const team = await getPossessionTeam(gameId);
  if (!team) return null;
  return (team as any).teamId ?? (team as any).abbreviation ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get team score by team ID.
 */
export async function getTeamScore(gameId: string, teamId: string): Promise<number> {
  const team = await getTeam(gameId, teamId);
  if (!team) return 0;
  const score = (team as any).score;
  return typeof score === 'number' && Number.isFinite(score) ? score : 0;
}

/**
 * Get home team score.
 */
export async function getHomeScore(gameId: string): Promise<number> {
  const team = await getHomeTeam(gameId);
  if (!team) return 0;
  return typeof team.score === 'number' ? team.score : 0;
}

/**
 * Get away team score.
 */
export async function getAwayScore(gameId: string): Promise<number> {
  const team = await getAwayTeam(gameId);
  if (!team) return 0;
  return typeof team.score === 'number' ? team.score : 0;
}

/**
 * Get total combined score.
 */
export async function getTotalScore(gameId: string): Promise<number> {
  const [home, away] = await Promise.all([getHomeScore(gameId), getAwayScore(gameId)]);
  return home + away;
}

/**
 * Get both scores as { home, away, total }.
 */
export async function getScores(gameId: string): Promise<{ home: number; away: number; total: number }> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return { home: 0, away: 0, total: 0 };
  
  let homeScore = 0;
  let awayScore = 0;
  
  for (const team of doc.teams) {
    const score = typeof team.score === 'number' ? team.score : 0;
    if ((team as any).homeAway === 'home') {
      homeScore = score;
    } else if ((team as any).homeAway === 'away') {
      awayScore = score;
    }
  }
  
  // Fallback to displayOrder if homeAway not set
  if (homeScore === 0 && awayScore === 0 && doc.teams.length >= 2) {
    const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
    homeScore = typeof sorted[0]?.score === 'number' ? sorted[0].score : 0;
    awayScore = typeof sorted[1]?.score === 'number' ? sorted[1].score : 0;
  }
  
  return { home: homeScore, away: awayScore, total: homeScore + awayScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a player by ID or name across all teams.
 */
export async function getPlayer(gameId: string, playerId: string): Promise<Player | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;
  return baseFindPlayer(doc, playerId);
}

/**
 * Get all players from doc (across all teams).
 */
export async function getAllPlayers(gameId: string): Promise<Player[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  const result: Player[] = [];
  for (const team of doc.teams) {
    const players = (team as any).players;
    if (Array.isArray(players)) {
      result.push(...players);
    } else if (players && typeof players === 'object') {
      result.push(...Object.values(players) as Player[]);
    }
  }
  return result;
}

/**
 * Get players for a specific team.
 */
export async function getTeamPlayers(gameId: string, teamId: string): Promise<Player[]> {
  const team = await getTeam(gameId, teamId);
  if (!team) return [];
  const players = (team as any).players;
  if (Array.isArray(players)) return players;
  if (players && typeof players === 'object') return Object.values(players) as Player[];
  return [];
}

/**
 * Get a player's stat value from a given category and key.
 */
export async function getPlayerStat(
  gameId: string,
  playerId: string,
  category: string,
  statKey: string,
): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  if (!player || !player.stats) return 0;
  const catStats = getCategory(player.stats as Record<string, Record<string, unknown>>, category);
  if (!catStats) return 0;
  const value = catStats[statKey];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get team stats category.
 */
export async function getTeamStatCategory(
  gameId: string,
  teamId: string,
  category: string,
): Promise<Record<string, unknown> | null> {
  const team = await getTeam(gameId, teamId);
  if (!team || !team.stats) return null;
  return getCategory(team.stats as Record<string, Record<string, unknown>>, category) ?? null;
}

/**
 * Get a specific team stat value.
 */
export async function getTeamStat(
  gameId: string,
  teamId: string,
  category: string,
  statKey: string,
): Promise<number> {
  const catStats = await getTeamStatCategory(gameId, teamId, category);
  if (!catStats) return 0;
  const value = catStats[statKey];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Utilities (extracted from Team object)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get team ID (teamId or abbreviation) from Team object.
 */
export function extractTeamId(team: Team | null | undefined): string | null {
  if (!team) return null;
  return (team as any).teamId ?? (team as any).abbreviation ?? null;
}

/**
 * Get team display name from Team object.
 */
export function extractTeamName(team: Team | null | undefined): string | null {
  if (!team) return null;
  return (team as any).displayName ?? (team as any).name ?? (team as any).abbreviation ?? null;
}

/**
 * Get team abbreviation from Team object.
 */
export function extractTeamAbbreviation(team: Team | null | undefined): string | null {
  if (!team) return null;
  return (team as any).abbreviation ?? null;
}

// Aliases for backward compatibility
export const getTeamId = extractTeamId;
export const getTeamName = extractTeamName;
export const getTeamAbbreviation = extractTeamAbbreviation;

// ─────────────────────────────────────────────────────────────────────────────
// Sync Doc Helpers (for code that already has doc loaded)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all teams from a doc object (sync).
 */
export function getAllTeamsFromDoc(doc: RefinedGameDoc | null | undefined): Team[] {
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams;
}

/**
 * Get home team from a doc object (sync).
 */
export function getHomeTeamFromDoc(doc: RefinedGameDoc | null | undefined): Team | null {
  if (!doc || !Array.isArray(doc.teams)) return null;
  const byHomeAway = doc.teams.find((t) => (t as any).homeAway === 'home');
  if (byHomeAway) return byHomeAway;
  const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
  return sorted[0] ?? null;
}

/**
 * Get away team from a doc object (sync).
 */
export function getAwayTeamFromDoc(doc: RefinedGameDoc | null | undefined): Team | null {
  if (!doc || !Array.isArray(doc.teams)) return null;
  const byHomeAway = doc.teams.find((t) => (t as any).homeAway === 'away');
  if (byHomeAway) return byHomeAway;
  const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
  return sorted[1] ?? null;
}

/**
 * Get possession team from a doc object (sync).
 */
export function getPossessionTeamFromDoc(doc: RefinedGameDoc | null | undefined): Team | null {
  if (!doc || !Array.isArray(doc.teams)) return null;
  return doc.teams.find((t) => (t as any).possession === true) ?? null;
}

/**
 * Get team by ID from a doc object (sync).
 */
export function getTeamFromDoc(doc: RefinedGameDoc | null | undefined, teamId: string): Team | null {
  if (!doc) return null;
  return baseFindTeam(doc, teamId);
}

/**
 * Get player by ID from a doc object (sync).
 */
export function getPlayerFromDoc(doc: RefinedGameDoc | null | undefined, playerId: string): Player | null {
  if (!doc) return null;
  return baseFindPlayer(doc, playerId);
}

/**
 * Get game status from a doc object (sync).
 */
export function getGameStatusFromDoc(doc: RefinedGameDoc | null | undefined): string | null {
  if (!doc) return null;
  const status = doc.status;
  if (typeof status === 'string' && status.trim().length) return status.trim();
  return null;
}

/**
 * Get game period from a doc object (sync).
 */
export function getGamePeriodFromDoc(doc: RefinedGameDoc | null | undefined): number | null {
  if (!doc) return null;
  const period = doc.period;
  if (typeof period === 'number' && Number.isFinite(period)) return period;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw Doc Access (for consumers that need the full doc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the full RefinedGameDoc for advanced use cases.
 * Prefer using specific getters when possible.
 */
export async function getGameDoc(gameId: string): Promise<RefinedGameDoc | null> {
  return getCachedDoc(gameId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { loadRefinedGame, findTeam, findPlayer, getCategory, REFINED_DIR, resolveGamePath, readJson } from './gameData';
export type { RefinedGameDoc, Team, Player, StatsByCategory, StatCategory } from './gameData';
