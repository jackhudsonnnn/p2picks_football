/**
 * U2Pick Data Provider
 *
 * A minimal data provider for U2Pick (user-defined) bets.
 * U2Pick doesn't have external game data, so this returns sensible defaults.
 */

import type { LeagueDataProvider, LeagueTeam, LeaguePlayer, GameStatus, GameScores, PlayerRecord } from './types';

export const u2pickDataProvider: LeagueDataProvider = {
  league: 'U2Pick',

  async getAvailableGames(): Promise<Record<string, string>> {
    // U2Pick has no games - bets are user-defined
    return {};
  },

  async getHomeTeam(_gameId: string): Promise<LeagueTeam | null> {
    return null;
  },

  async getAwayTeam(_gameId: string): Promise<LeagueTeam | null> {
    return null;
  },

  async getAllTeams(_gameId: string): Promise<LeagueTeam[]> {
    return [];
  },

  async getTeam(_gameId: string, _teamId: string): Promise<LeagueTeam | null> {
    return null;
  },

  async getAllPlayers(_gameId: string): Promise<LeaguePlayer[]> {
    return [];
  },

  async getPlayer(_gameId: string, _playerId: string): Promise<LeaguePlayer | null> {
    return null;
  },

  async getAllPlayerRecords(_gameId: string): Promise<PlayerRecord[]> {
    return [];
  },

  async getGameStatus(_gameId: string): Promise<GameStatus> {
    // U2Pick bets don't have game status - resolution is manual
    return 'STATUS_SCHEDULED';
  },

  async getGamePeriod(_gameId: string): Promise<number | null> {
    return null;
  },

  async getMatchup(_gameId: string): Promise<string> {
    // U2Pick bets don't have matchups - return a friendly label
    return 'Custom Bet';
  },

  async getScores(_gameId: string): Promise<GameScores> {
    return { home: 0, away: 0, total: 0 };
  },

  async getHomeScore(_gameId: string): Promise<number> {
    return 0;
  },

  async getAwayScore(_gameId: string): Promise<number> {
    return 0;
  },

  async getTotalScore(_gameId: string): Promise<number> {
    return 0;
  },

  async getPlayerStat(
    _gameId: string,
    _playerId: string,
    _category: string,
    _field: string,
  ): Promise<number | null> {
    return null;
  },

  invalidateCache(_gameId: string): void {
    // No-op - U2Pick has no cache
  },

  clearCache(): void {
    // No-op - U2Pick has no cache
  },
};
