/**
 * Centralized accessors for refined NBA data.
 * 
 * This module acts as a data access layer for refined NBA game data.
 * Instead of passing doc objects around, consumers call getters with a gameId.
 * Internally, documents are cached based on NBA_DATA_INTERVAL_SECONDS
 * to avoid redundant file reads when multiple getters are called in sequence.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../config/env';
import type {
  RefinedNbaGame,
  RefinedTeam,
  RefinedPlayer,
  PlayerStats,
  TeamStats,
} from '../utils/nba/nbaRefinementTransformer';
import { createLogger } from '../utils/logger';

const logger = createLogger('nbaRefinedDataAccessors');

// Re-export types for consumers
export type { RefinedNbaGame, RefinedTeam, RefinedPlayer, PlayerStats, TeamStats };

const REFINED_DIR = path.join('src', 'data', 'nba_data', 'nba_refined_live_stats');

export type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position?: string | null;
};

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data) as T;
}

/**
 * List available games by reading refined JSON files and deriving a human-friendly label.
 */
export async function getAvailableGames(): Promise<Record<string, string>> {
  try {
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    const files = await fs.readdir(dir, { withFileTypes: true } as any);
    const jsonFiles = files
      .filter((d: any) => d.isFile() && d.name.endsWith('.json'))
      .map((d: any) => d.name.replace(/\.json$/i, ''));

    const results: Record<string, string> = {};
    await Promise.all(
      jsonFiles.map(async (gameId: string) => {
        try {
          const teams = await getAllTeams(gameId);
          if (teams.length >= 2) {
            const a = extractTeamName(teams[0]) || '';
            const b = extractTeamName(teams[1]) || '';
            results[gameId] = `${a} vs ${b}`.trim();
          } else {
            logger.warn({ gameId }, `Refined game file for gameId ${gameId} has fewer than 2 teams`);
            results[gameId] = gameId;
          }
        } catch {
          logger.warn({ gameId }, `Could not load or parse refined game file for gameId ${gameId}`);
          results[gameId] = gameId;
        }
      })
    );

    return results;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface CachedDoc {
  doc: RefinedNbaGame;
  loadedAt: number;
}

const cache = new Map<string, CachedDoc>();

/** Cache TTL in ms - data only changes every NBA_DATA_INTERVAL_SECONDS */
const CACHE_TTL_MS = env.NBA_DATA_INTERVAL_SECONDS * 1000;

function getCacheTtlMs(): number {
  // Use 90% of the interval to ensure we refresh before stale
  return Math.max(5000, CACHE_TTL_MS * 0.9);
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
async function getCachedDoc(gameId: string): Promise<RefinedNbaGame | null> {
  const now = Date.now();
  const cached = cache.get(gameId);

  if (cached && (now - cached.loadedAt) < getCacheTtlMs()) {
    return cached.doc;
  }

  try {
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    const doc = await readJson<RefinedNbaGame>(path.join(dir, `${gameId}.json`));
    if (doc) {
      cache.set(gameId, { doc, loadedAt: now });
    } else {
      cache.delete(gameId);
    }
    return doc;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status / Period / Clock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get game status string (e.g., STATUS_IN_PROGRESS, STATUS_FINAL).
 */
export async function getGameStatus(gameId: string): Promise<string> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return 'STATUS_UNKNOWN';
  const status = doc.status;
  if (typeof status === 'string' && status.trim().length) return status.trim();
  return 'STATUS_UNKNOWN';
}

/**
 * Get game status text (e.g., "Q4 6:19", "Final").
 */
export async function getGameStatusText(gameId: string): Promise<string> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return '';
  return doc.statusText || '';
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

/**
 * Get game clock (e.g., "PT06M19.00S").
 */
export async function getGameClock(gameId: string): Promise<string> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return '';
  return doc.gameClock || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get teams
 */
export async function listTeams(gameId: string): Promise<RefinedTeam[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams;
}

/**
 * Get the matchup
 * Example: "MIL vs OKC"
 */
export async function getMatchup(gameId: string): Promise<string> {
  const homeTeam = await getHomeTeam(gameId);
  const awayTeam = await getAwayTeam(gameId);
  const homeLabel = homeTeam?.abbreviation || homeTeam?.displayName || 'home';
  const awayLabel = awayTeam?.abbreviation || awayTeam?.displayName || 'away';
  return `${homeLabel} vs ${awayLabel}`;
}

/**
 * Find a team by ID or abbreviation.
 */
export async function getTeam(gameId: string, teamId: string): Promise<RefinedTeam | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;
  return (
    doc.teams.find(
      (t) => t.teamId === teamId || t.abbreviation === teamId,
    ) || null
  );
}

/**
 * Get home team (homeAway === 'home').
 */
export async function getHomeTeam(gameId: string): Promise<RefinedTeam | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  return doc.teams.find((t) => t.homeAway === 'home') ?? null;
}

/**
 * Get away team (homeAway === 'away').
 */
export async function getAwayTeam(gameId: string): Promise<RefinedTeam | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  return doc.teams.find((t) => t.homeAway === 'away') ?? null;
}

/**
 * Get all teams from doc.
 */
export async function getAllTeams(gameId: string): Promise<RefinedTeam[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams;
}

/**
 * Get home team name
 */
export async function getHomeTeamName(gameId: string): Promise<string> {
  const homeTeam = await getHomeTeam(gameId);
  return homeTeam?.displayName || 'home';
}

/**
 * Get away team name
 */
export async function getAwayTeamName(gameId: string): Promise<string> {
  const awayTeam = await getAwayTeam(gameId);
  return awayTeam?.displayName || 'away';
}

/**
 * Get both teams's names, abbreviations, and IDs.
 */
export async function getGameTeams(gameId: string): Promise<Array<Record<string, string>>> {
  const teams = await getAllTeams(gameId);
  return teams.map((t) => ({
    teamId: extractTeamId(t) || '',
    abbreviation: t.abbreviation || '',
    name: extractTeamName(t) || '',
  }));
}

/**
 * Get opponent team for a given team ID.
 */
export async function getOpponentTeam(gameId: string, teamId: string): Promise<RefinedTeam | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  return doc.teams.find((t) => t.teamId !== teamId && t.abbreviation !== teamId) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get team score by team ID.
 */
export async function getTeamScore(gameId: string, teamId: string): Promise<number> {
  const team = await getTeam(gameId, teamId);
  if (!team) {
    return -1;
  }
  return team.score || -1;
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
    if (team.homeAway === 'home') {
      homeScore = score;
    } else if (team.homeAway === 'away') {
      awayScore = score;
    }
  }

  return { home: homeScore, away: awayScore, total: homeScore + awayScore };
}

/**
 * Get period scores for a team.
 */
export async function getTeamPeriodScores(
  gameId: string,
  teamId: string
): Promise<Array<{ period: number; score: number }>> {
  const team = await getTeam(gameId, teamId);
  if (!team) return [];
  return team.periods || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a player by ID or name across all teams.
 */
export async function getPlayer(gameId: string, playerId: string): Promise<RefinedPlayer | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;

  for (const team of doc.teams || []) {
    const players = team.players;
    if (!players) continue;
    for (const player of players) {
      if (player.athleteId === playerId) return player;
      if (String(player.personId) === playerId) return player;
      if (player.fullName === playerId) return player;
    }
  }
  return null;
}

/**
 * Get all players from doc (across all teams).
 */
export async function getAllPlayers(gameId: string): Promise<RefinedPlayer[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  const result: RefinedPlayer[] = [];
  for (const team of doc.teams) {
    if (Array.isArray(team.players)) {
      result.push(...team.players);
    }
  }
  return result;
}

/**
 * Get all player records (id, name, team, position) from doc.
 */
export async function getAllPlayerRecords(gameId: string): Promise<PlayerRecord[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  
  const records: PlayerRecord[] = [];
  for (const team of doc.teams) {
    if (Array.isArray(team.players)) {
      for (const player of team.players) {
        records.push({
          id: player.athleteId,
          name: player.fullName,
          team: team.teamId,
          position: player.position || null,
        });
      }
    }
  }
  return records;
}

/**
 * Get players for a specific team.
 */
export async function getTeamPlayers(gameId: string, teamId: string): Promise<RefinedPlayer[]> {
  const team = await getTeam(gameId, teamId);
  if (!team) return [];
  return team.players || [];
}

/**
 * Get starters for a specific team.
 */
export async function getTeamStarters(gameId: string, teamId: string): Promise<RefinedPlayer[]> {
  const players = await getTeamPlayers(gameId, teamId);
  return players.filter((p) => p.stats.starter);
}

/**
 * Get bench players for a specific team.
 */
export async function getTeamBench(gameId: string, teamId: string): Promise<RefinedPlayer[]> {
  const players = await getTeamPlayers(gameId, teamId);
  return players.filter((p) => !p.stats.starter);
}

/**
 * Get a player's stat value.
 */
export async function getPlayerStat(
  gameId: string,
  playerId: string,
  statKey: keyof PlayerStats,
): Promise<number | string | boolean> {
  const player = await getPlayer(gameId, playerId);
  if (!player || !player.stats) return 0;
  const value = player.stats[statKey];
  return value ?? 0;
}

/**
 * Get a player's points.
 */
export async function getPlayerPoints(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.points ?? 0;
}

/**
 * Get a player's rebounds.
 */
export async function getPlayerRebounds(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.rebounds ?? 0;
}

/**
 * Get a player's assists.
 */
export async function getPlayerAssists(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.assists ?? 0;
}

/**
 * Get a player's steals.
 */
export async function getPlayerSteals(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.steals ?? 0;
}

/**
 * Get a player's blocks.
 */
export async function getPlayerBlocks(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.blocks ?? 0;
}

/**
 * Get a player's turnovers.
 */
export async function getPlayerTurnovers(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.turnovers ?? 0;
}

/**
 * Get a player's three pointers made.
 */
export async function getPlayerThreePointersMade(gameId: string, playerId: string): Promise<number> {
  const player = await getPlayer(gameId, playerId);
  return player?.stats?.threePointersMade ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a specific team stat value.
 */
export async function getTeamStat(
  gameId: string,
  teamId: string,
  statKey: keyof TeamStats,
): Promise<number> {
  const team = await getTeam(gameId, teamId);
  if (!team || !team.stats) return 0;
  const value = team.stats[statKey];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

/**
 * Get team stats object.
 */
export async function getTeamStats(gameId: string, teamId: string): Promise<TeamStats | null> {
  const team = await getTeam(gameId, teamId);
  return team?.stats ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Utilities (extracted from Team object)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get team ID from Team object.
 */
export function extractTeamId(team: RefinedTeam | null | undefined): string | null {
  if (!team) return null;
  return team.teamId ?? team.abbreviation ?? null;
}

/**
 * Get team display name from Team object.
 */
export function extractTeamName(team: RefinedTeam | null | undefined): string | null {
  if (!team) return null;
  return team.displayName ?? team.name ?? team.abbreviation ?? null;
}

/**
 * Get team abbreviation from Team object.
 */
export function extractTeamAbbreviation(team: RefinedTeam | null | undefined): string | null {
  if (!team) return null;
  return team.abbreviation ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw Doc Access (for consumers that need the full doc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the full RefinedNbaGame doc.
 * Prefer using specific getters when possible.
 */
export async function getGameDoc(gameId: string): Promise<RefinedNbaGame | null> {
  return getCachedDoc(gameId);
}
