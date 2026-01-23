/**
 * League Data Abstraction Layer - Unified Types
 *
 * Common types for accessing game data across all supported leagues.
 */

import type { League } from '../../types/league';

// ─────────────────────────────────────────────────────────────────────────────
// Team Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LeagueTeam {
  teamId: string;
  abbreviation: string;
  displayName: string;
  score: number;
  homeAway: 'home' | 'away';
  /** Raw league-specific data for advanced use cases */
  raw?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaguePlayer {
  playerId: string;
  fullName: string;
  position: string;
  teamId: string;
  jersey?: string;
  headshot?: string;
  /** Raw league-specific data for advanced use cases */
  raw?: unknown;
}

export interface PlayerRecord {
  id: string;
  name: string;
  team: string;
  position?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Types
// ─────────────────────────────────────────────────────────────────────────────

export type GameStatus =
  | 'STATUS_SCHEDULED'
  | 'STATUS_IN_PROGRESS'
  | 'STATUS_HALFTIME'
  | 'STATUS_END_PERIOD'
  | 'STATUS_FINAL'
  | 'STATUS_POSTPONED'
  | 'STATUS_CANCELED'
  | 'STATUS_UNKNOWN';

export interface GameInfo {
  gameId: string;
  league: League;
  status: GameStatus;
  statusText?: string;
  period: number | null;
  clock?: string;
  homeTeam: LeagueTeam | null;
  awayTeam: LeagueTeam | null;
}

export interface GameScores {
  home: number;
  away: number;
  total: number;
}

export interface GameMatchup {
  gameId: string;
  label: string;
  homeTeam: {
    teamId: string;
    abbreviation: string;
    displayName: string;
  };
  awayTeam: {
    teamId: string;
    abbreviation: string;
    displayName: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Provider Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface that each league's data accessor must implement.
 */
export interface LeagueDataProvider {
  /** The league this provider handles */
  league: League;

  /** Get list of available games */
  getAvailableGames(): Promise<Record<string, string>>;

  /** Get game status */
  getGameStatus(gameId: string): Promise<GameStatus>;

  /** Get game period/quarter */
  getGamePeriod(gameId: string): Promise<number | null>;

  /** Get matchup string (e.g., "BUF vs BAL") */
  getMatchup(gameId: string): Promise<string>;

  /** Get home team */
  getHomeTeam(gameId: string): Promise<LeagueTeam | null>;

  /** Get away team */
  getAwayTeam(gameId: string): Promise<LeagueTeam | null>;

  /** Get all teams */
  getAllTeams(gameId: string): Promise<LeagueTeam[]>;

  /** Get team by ID */
  getTeam(gameId: string, teamId: string): Promise<LeagueTeam | null>;

  /** Get scores */
  getScores(gameId: string): Promise<GameScores>;

  /** Get home score */
  getHomeScore(gameId: string): Promise<number>;

  /** Get away score */
  getAwayScore(gameId: string): Promise<number>;

  /** Get total score */
  getTotalScore(gameId: string): Promise<number>;

  /** Get all players */
  getAllPlayers(gameId: string): Promise<LeaguePlayer[]>;

  /** Get player by ID */
  getPlayer(gameId: string, playerId: string): Promise<LeaguePlayer | null>;

  /** Get all player records */
  getAllPlayerRecords(gameId: string): Promise<PlayerRecord[]>;

  /**
   * Get a specific player stat.
   * @param gameId - Game identifier
   * @param playerId - Player identifier (ID or name:PlayerName)
   * @param category - Stat category (e.g., 'passing', 'points')
   * @param field - Stat field within category (e.g., 'passingYards', 'points')
   */
  getPlayerStat(
    gameId: string,
    playerId: string,
    category: string,
    field: string,
  ): Promise<number | null>;

  /** Get possession team ID (NFL only, returns null for other leagues) */
  getPossessionTeamId?(gameId: string): Promise<string | null>;

  /** Get possession team name (NFL only, returns null for other leagues) */
  getPossessionTeamName?(gameId: string): Promise<string | null>;

  /** Invalidate cache for a game */
  invalidateCache(gameId: string): void;

  /** Clear all cache */
  clearCache(): void;
}
