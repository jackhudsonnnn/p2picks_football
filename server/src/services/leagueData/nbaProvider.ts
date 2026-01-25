/**
 * NBA Data Provider - Adapter for NBA data accessors
 *
 * Wraps the existing NBA refined data accessors to implement
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
import * as nbaAccessors from '../../data/nbaRefinedDataAccessors';

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Functions
// ─────────────────────────────────────────────────────────────────────────────

function adaptNbaTeam(team: nbaAccessors.RefinedTeam | null): LeagueTeam | null {
  if (!team) return null;
  return {
    teamId: team.teamId || team.abbreviation || '',
    abbreviation: team.abbreviation || '',
    displayName: team.displayName || team.name || '',
    score: typeof team.score === 'number' ? team.score : 0,
    homeAway: team.homeAway === 'home' || team.homeAway === 'away' ? team.homeAway : 'home',
    raw: team,
  };
}

function adaptNbaPlayer(player: nbaAccessors.RefinedPlayer | null, teamId?: string): LeaguePlayer | null {
  if (!player) return null;
  return {
    playerId: player.athleteId || String(player.personId) || '',
    fullName: player.fullName || `${player.firstName} ${player.lastName}`.trim(),
    position: player.position || '',
    teamId: teamId || '',
    jersey: player.jersey,
    raw: player,
  };
}

function normalizeStatus(status: string): GameStatus {
  const normalized = status.trim().toUpperCase();
  switch (normalized) {
    case 'STATUS_SCHEDULED':
    case 'PRE_GAME':
      return 'STATUS_SCHEDULED';
    case 'STATUS_IN_PROGRESS':
    case 'IN_PROGRESS':
      return 'STATUS_IN_PROGRESS';
    case 'STATUS_HALFTIME':
    case 'HALFTIME':
      return 'STATUS_HALFTIME';
    case 'STATUS_END_PERIOD':
    case 'END_PERIOD':
      return 'STATUS_END_PERIOD';
    case 'STATUS_FINAL':
    case 'FINAL':
      return 'STATUS_FINAL';
    case 'STATUS_POSTPONED':
    case 'POSTPONED':
      return 'STATUS_POSTPONED';
    case 'STATUS_CANCELED':
    case 'STATUS_CANCELLED':
    case 'CANCELED':
    case 'CANCELLED':
      return 'STATUS_CANCELED';
    default:
      return 'STATUS_UNKNOWN';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NBA Data Provider
// ─────────────────────────────────────────────────────────────────────────────

export const nbaDataProvider: LeagueDataProvider = {
  league: 'NBA',

  async getAvailableGames(): Promise<Record<string, string>> {
    return nbaAccessors.getAvailableGames();
  },

  async getGameStatus(gameId: string): Promise<GameStatus> {
    const status = await nbaAccessors.getGameStatus(gameId);
    return normalizeStatus(status);
  },

  async getGamePeriod(gameId: string): Promise<number | null> {
    return nbaAccessors.getGamePeriod(gameId);
  },

  async getMatchup(gameId: string): Promise<string> {
    return nbaAccessors.getMatchup(gameId);
  },

  async getHomeTeam(gameId: string): Promise<LeagueTeam | null> {
    const team = await nbaAccessors.getHomeTeam(gameId);
    return adaptNbaTeam(team);
  },

  async getAwayTeam(gameId: string): Promise<LeagueTeam | null> {
    const team = await nbaAccessors.getAwayTeam(gameId);
    return adaptNbaTeam(team);
  },

  async getAllTeams(gameId: string): Promise<LeagueTeam[]> {
    const teams = await nbaAccessors.getAllTeams(gameId);
    return teams.map(adaptNbaTeam).filter((t): t is LeagueTeam => t !== null);
  },

  async getTeam(gameId: string, teamId: string): Promise<LeagueTeam | null> {
    const team = await nbaAccessors.getTeam(gameId, teamId);
    return adaptNbaTeam(team);
  },

  async getScores(gameId: string): Promise<GameScores> {
    return nbaAccessors.getScores(gameId);
  },

  async getHomeScore(gameId: string): Promise<number> {
    return nbaAccessors.getHomeScore(gameId);
  },

  async getAwayScore(gameId: string): Promise<number> {
    return nbaAccessors.getAwayScore(gameId);
  },

  async getTotalScore(gameId: string): Promise<number> {
    return nbaAccessors.getTotalScore(gameId);
  },

  async getAllPlayers(gameId: string): Promise<LeaguePlayer[]> {
    const doc = await nbaAccessors.getAllPlayers(gameId);
    // We need to track which team each player belongs to
    const teams = await nbaAccessors.getAllTeams(gameId);
    const result: LeaguePlayer[] = [];
    
    for (const team of teams) {
      for (const player of team.players || []) {
        const adapted = adaptNbaPlayer(player, team.teamId);
        if (adapted) result.push(adapted);
      }
    }
    return result;
  },

  async getPlayer(gameId: string, playerId: string): Promise<LeaguePlayer | null> {
    const player = await nbaAccessors.getPlayer(gameId, playerId);
    if (!player) return null;
    
    // Find which team this player belongs to
    const teams = await nbaAccessors.getAllTeams(gameId);
    for (const team of teams) {
      if (team.players?.some((p) => p.athleteId === player.athleteId || p.personId === player.personId)) {
        return adaptNbaPlayer(player, team.teamId);
      }
    }
    return adaptNbaPlayer(player);
  },

  async getAllPlayerRecords(gameId: string): Promise<PlayerRecord[]> {
    return nbaAccessors.getAllPlayerRecords(gameId);
  },

  async getPlayerStat(
    gameId: string,
    playerId: string,
    category: string,
    field: string,
  ): Promise<number | null> {
    // NBA stats are flat (not categorized like NFL), so we use field directly
    // Common mappings for NBA stats
    const player = await nbaAccessors.getPlayer(gameId, playerId);
    if (!player || !player.stats) return null;

    // Map category.field to NBA stat keys
    const statKey = mapNbaStatKey(category, field);
    const stats = player.stats as unknown as Record<string, unknown>;
    const value = stats[statKey];
    
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return null;
  },

  invalidateCache(gameId: string): void {
    nbaAccessors.invalidateCache(gameId);
  },

  clearCache(): void {
    nbaAccessors.clearCache();
  },
};

/**
 * Map category + field to NBA stat key.
 * NBA stats are flat, so we try to find the matching key.
 */
function mapNbaStatKey(category: string, field: string): string {
  // Direct field match (most common)
  if (!category || category.toLowerCase() === 'stats') {
    return field;
  }
  
  // Category-prefixed mappings
  const categoryLower = category.toLowerCase();
  const fieldLower = field.toLowerCase();
  
  // Handle common category mappings
  switch (categoryLower) {
    case 'scoring':
    case 'points':
      if (fieldLower === 'points' || fieldLower === 'total') return 'points';
      break;
    case 'rebounding':
    case 'rebounds':
      if (fieldLower === 'total' || fieldLower === 'rebounds') return 'rebounds';
      if (fieldLower === 'offensive') return 'reboundsOffensive';
      if (fieldLower === 'defensive') return 'reboundsDefensive';
      break;
    case 'assists':
      return 'assists';
    case 'steals':
      return 'steals';
    case 'blocks':
      return 'blocks';
    case 'turnovers':
      return 'turnovers';
  }
  
  // Default: use field as-is
  return field;
}
