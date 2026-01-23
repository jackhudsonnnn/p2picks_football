/**
 * NFL Data Provider - Adapter for NFL data accessors
 *
 * Wraps the existing NFL refined data accessors to implement
 * the unified LeagueDataProvider interface.
 */

import type {
  LeagueDataProvider,
  LeagueTeam,
  LeaguePlayer,
  PlayerRecord,
  GameStatus,
  GameScores,
} from './types';
import * as nflAccessors from '../nflData/nflRefinedDataAccessors';

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Functions
// ─────────────────────────────────────────────────────────────────────────────

function adaptNflTeam(team: nflAccessors.Team | null): LeagueTeam | null {
  if (!team) return null;
  return {
    teamId: team.teamId || (team as any).abbreviation || '',
    abbreviation: team.abbreviation || '',
    displayName: team.displayName || '',
    score: typeof team.score === 'number' ? team.score : 0,
    homeAway: (team.homeAway === 'home' || team.homeAway === 'away') ? team.homeAway : 'home',
    raw: team,
  };
}

function adaptNflPlayer(player: nflAccessors.Player | null, teamId?: string): LeaguePlayer | null {
  if (!player) return null;
  return {
    playerId: player.athleteId || '',
    fullName: player.fullName || '',
    position: player.position || '',
    teamId: teamId || (player as any).teamId || '',
    jersey: player.jersey,
    headshot: player.headshot,
    raw: player,
  };
}

function normalizeStatus(status: string): GameStatus {
  const normalized = status.trim().toUpperCase();
  switch (normalized) {
    case 'STATUS_SCHEDULED':
      return 'STATUS_SCHEDULED';
    case 'STATUS_IN_PROGRESS':
      return 'STATUS_IN_PROGRESS';
    case 'STATUS_HALFTIME':
      return 'STATUS_HALFTIME';
    case 'STATUS_END_PERIOD':
      return 'STATUS_END_PERIOD';
    case 'STATUS_FINAL':
      return 'STATUS_FINAL';
    case 'STATUS_POSTPONED':
      return 'STATUS_POSTPONED';
    case 'STATUS_CANCELED':
    case 'STATUS_CANCELLED':
      return 'STATUS_CANCELED';
    default:
      return 'STATUS_UNKNOWN';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NFL Data Provider
// ─────────────────────────────────────────────────────────────────────────────

export const nflDataProvider: LeagueDataProvider = {
  league: 'NFL',

  async getAvailableGames(): Promise<Record<string, string>> {
    return nflAccessors.getAvailableGames();
  },

  async getGameStatus(gameId: string): Promise<GameStatus> {
    const status = await nflAccessors.getGameStatus(gameId);
    return normalizeStatus(status);
  },

  async getGamePeriod(gameId: string): Promise<number | null> {
    return nflAccessors.getGamePeriod(gameId);
  },

  async getMatchup(gameId: string): Promise<string> {
    return nflAccessors.getMatchup(gameId);
  },

  async getHomeTeam(gameId: string): Promise<LeagueTeam | null> {
    const team = await nflAccessors.getHomeTeam(gameId);
    return adaptNflTeam(team);
  },

  async getAwayTeam(gameId: string): Promise<LeagueTeam | null> {
    const team = await nflAccessors.getAwayTeam(gameId);
    return adaptNflTeam(team);
  },

  async getAllTeams(gameId: string): Promise<LeagueTeam[]> {
    const teams = await nflAccessors.getAllTeams(gameId);
    return teams.map(adaptNflTeam).filter((t): t is LeagueTeam => t !== null);
  },

  async getTeam(gameId: string, teamId: string): Promise<LeagueTeam | null> {
    const team = await nflAccessors.getTeam(gameId, teamId);
    return adaptNflTeam(team);
  },

  async getScores(gameId: string): Promise<GameScores> {
    return nflAccessors.getScores(gameId);
  },

  async getHomeScore(gameId: string): Promise<number> {
    return nflAccessors.getHomeScore(gameId);
  },

  async getAwayScore(gameId: string): Promise<number> {
    return nflAccessors.getAwayScore(gameId);
  },

  async getTotalScore(gameId: string): Promise<number> {
    return nflAccessors.getTotalScore(gameId);
  },

  async getAllPlayers(gameId: string): Promise<LeaguePlayer[]> {
    const players = await nflAccessors.getAllPlayers(gameId);
    return players.map((p) => adaptNflPlayer(p)).filter((p): p is LeaguePlayer => p !== null);
  },

  async getPlayer(gameId: string, playerId: string): Promise<LeaguePlayer | null> {
    const player = await nflAccessors.getPlayer(gameId, playerId);
    return adaptNflPlayer(player);
  },

  async getAllPlayerRecords(gameId: string): Promise<PlayerRecord[]> {
    return nflAccessors.getAllPlayerRecords(gameId);
  },

  async getPlayerStat(
    gameId: string,
    playerId: string,
    category: string,
    field: string,
  ): Promise<number | null> {
    const value = await nflAccessors.getPlayerStat(gameId, playerId, category, field);
    return value === 0 ? null : value;
  },

  async getPossessionTeamId(gameId: string): Promise<string | null> {
    return nflAccessors.getPossessionTeamId(gameId);
  },

  async getPossessionTeamName(gameId: string): Promise<string | null> {
    return nflAccessors.getPossessionTeamName(gameId);
  },

  invalidateCache(gameId: string): void {
    nflAccessors.invalidateCache(gameId);
  },

  clearCache(): void {
    nflAccessors.clearCache();
  },
};
