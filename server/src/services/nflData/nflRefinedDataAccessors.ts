/**
 * Centralized accessors for refined nfl data.
 * 
 * This module acts as a data access layer for refined NFL game data.
 * Instead of passing doc objects around, consumers call getters with a gameId.
 * Internally, documents are cached based on NFL_DATA_INTERVAL_SECONDS
 * to avoid redundant file reads when multiple getters are called in sequence.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { NFL_DATA_INTERVAL_SECONDS } from '../../constants/environment'

const REFINED_DIR = path.join('src', 'data', 'nfl_refined_live_stats');

export type StatCategory =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'fumbles'
  | 'defensive'
  | 'interceptions'
  | 'kickReturns'
  | 'puntReturns'
  | 'kicking'
  | 'punting'
  | 'scoring';

export interface StatsByCategory {
  [category: string]: Record<string, unknown>;
}

export interface Player {
  athleteId: string;
  fullName: string;
  position: string;
  jersey: string;
  headshot: string;
  stats: StatsByCategory;
}

export interface Team {
  teamId: string;
  abbreviation: string;
  displayName: string;
  score: number;
  stats: StatsByCategory;
  players: Player[];
  homeAway?: string;
  displayOrder?: number;
  possession?: boolean;
}

export interface RefinedGameDoc {
  eventId: string;
  generatedAt: string;
  source?: string;
  status?: string; // STATUS_IN_PROGRESS, STATUS_FINAL, STATUS_HALFTIME, STATUS_SCHEDULED, STATUS_END_PERIOD
  period?: number | null;
  teams: Team[];
  note?: string;
}

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
            console.warn(`Warning: Refined game file for gameId ${gameId} has fewer than 2 teams`);
            results[gameId] = gameId;
          }
        } catch {
          console.warn(`Warning: Could not load or parse refined game file for gameId ${gameId}`);
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

export function getCategory(
  statsByCategory: Record<string, Record<string, unknown>>,
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

// ─────────────────────────────────────────────────────────────────────────────
// Cache Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface CachedDoc {
  doc: RefinedGameDoc;
  loadedAt: number;
}

const cache = new Map<string, CachedDoc>();

/** Cache TTL in ms - data only changes every NFL_DATA_INTERVAL_SECONDS */
function getCacheTtlMs(): number {
  const seconds = Number(NFL_DATA_INTERVAL_SECONDS) || 20;
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

  try {
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    const doc = await readJson<RefinedGameDoc>(path.join(dir, `${gameId}.json`));
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
 * Get teams
 */
export async function listTeams(gameId: string): Promise<Team[]> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams as Team[];
}

/**
 * Get the matchup
 * Example: "BUF vs BAL"
 */
export async function getMatchup(gameId: string): Promise<string> {
  const homeTeam = await getHomeTeam(gameId);
  const awayTeam = await getAwayTeam(gameId);
  const homeLabel = homeTeam?.abbreviation || homeTeam?.displayName || "home";
  const awayLabel = awayTeam?.abbreviation || awayTeam?.displayName || "away";
  return `${homeLabel} vs ${awayLabel}`;
}

/**
 * Find a team by ID or abbreviation.
 */
export async function getTeam(gameId: string, teamId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc) return null;
  return (
    doc.teams.find(
      (t) => (t as any).teamId === teamId || (t as any).abbreviation === teamId,
    ) || null
  );
}

/**
 * Get home team (homeAway === 'home' or displayOrder === 1).
 */
export async function getHomeTeam(gameId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  const byHomeAway = doc.teams.find((t) => (t as any).homeAway === 'home');
  if (byHomeAway) return byHomeAway;
  const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
  return sorted[1] ?? null;
}

/**
 * Get away team (homeAway === 'away' or displayOrder === 0).
 */
export async function getAwayTeam(gameId: string): Promise<Team | null> {
  const doc = await getCachedDoc(gameId);
  if (!doc || !Array.isArray(doc.teams)) return null;
  const byHomeAway = doc.teams.find((t) => (t as any).homeAway === 'away');
  if (byHomeAway) return byHomeAway;
  const sorted = [...doc.teams].sort((a, b) => ((a as any).displayOrder ?? 0) - ((b as any).displayOrder ?? 0));
  return sorted[0] ?? null;
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
 * Get both teams's names, abbreviations, and IDs.
 */
export async function getGameTeams(gameId: string): Promise<Array<Record<string, string>>> {
  const teams = await getAllTeams(gameId);
  return teams.map((t) => ({
    teamId: extractTeamId(t) || '',
    abbreviation: (t as any).abbreviation || '',
    name: extractTeamName(t) || '',
  }));
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
  const team: any = await getTeam(gameId, teamId);
  if (!team) {
    return -1;
  }

  return team.score || -1;
}

/**
 * Get team score stats (score, touchdowns, field goals, and safeties) by team ID.
 */
export async function getTeamScoreStats(
  gameId: string,
  teamId: string,
): Promise<{
  score: number;
  touchdowns: number;
  fieldGoals: number;
  safeties: number;
}> {
  const team: any = await getTeam(gameId, teamId);
  if (!team) {
    return { score: -1, touchdowns: -1, fieldGoals: -1, safeties: -1 };
  }

  let score: number = team.score || -1;

  if (!team.scoring) {
    return { score, touchdowns: -1, fieldGoals: -1, safeties: -1 };
  }

  let touchdowns: number = team.scoring.touchdowns || -1;
  let fieldGoals: number = team.scoring.fieldGoals || -1;
  let safeties: number = team.scoring.safeties || -1;

  return { score, touchdowns, fieldGoals, safeties };
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

  for (const team of doc.teams || []) {
    const players = (team as any).players as any;
    if (!players) continue;
    if (!Array.isArray(players)) {
      const direct = (players as Record<string, Player>)[playerId];
      if (direct) return direct;
      for (const candidate of Object.values(players as Record<string, Player>)) {
        if (candidate.athleteId === playerId) return candidate;
      }
    } else {
      for (const candidate of players as Player[]) {
        if (candidate.athleteId === playerId) return candidate;
        if (`name:${candidate.fullName}` === playerId) return candidate;
      }
    }
  }
  return null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Raw Doc Access (for consumers that need the full doc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the full RefinedGameDoc.
 * Prefer using specific getters when possible.
 * TODO: depreate
 */
export async function getGameDoc(gameId: string): Promise<RefinedGameDoc | null> {
  return getCachedDoc(gameId);
}

