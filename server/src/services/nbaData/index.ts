/**
 * NBA Data Services - Main exports
 */

// Ingest service
export {
  startNbaDataIngestService,
  stopNbaDataIngestService,
} from './nbaDataIngestService';

// Game feed service
export {
  startNbaGameFeedService,
  stopNbaGameFeedService,
  subscribeToNbaGameFeed,
  getCachedNbaGameDoc,
  getCachedNbaSignature,
  type GameFeedEvent,
  type GameFeedListener,
} from './nbaGameFeedService';

// Refined data accessors
export {
  // Types
  type RefinedNbaGame,
  type RefinedTeam,
  type RefinedPlayer,
  type PlayerStats,
  type TeamStats,
  type PlayerRecord,
  // Cache management
  invalidateCache,
  clearCache,
  // Game status/period
  getGameStatus,
  getGameStatusText,
  getGamePeriod,
  getGameClock,
  // Teams
  listTeams,
  getMatchup,
  getTeam,
  getHomeTeam,
  getAwayTeam,
  getAllTeams,
  getHomeTeamName,
  getAwayTeamName,
  getGameTeams,
  getOpponentTeam,
  // Scores
  getTeamScore,
  getHomeScore,
  getAwayScore,
  getTotalScore,
  getScores,
  getTeamPeriodScores,
  // Players
  getPlayer,
  getAllPlayers,
  getAllPlayerRecords,
  getTeamPlayers,
  getTeamStarters,
  getTeamBench,
  getPlayerStat,
  getPlayerPoints,
  getPlayerRebounds,
  getPlayerAssists,
  getPlayerSteals,
  getPlayerBlocks,
  getPlayerTurnovers,
  getPlayerThreePointersMade,
  // Team stats
  getTeamStat,
  getTeamStats,
  // Utilities
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
  // Available games
  getAvailableGames,
  // Full doc access
  getGameDoc,
} from './nbaRefinedDataAccessors';
