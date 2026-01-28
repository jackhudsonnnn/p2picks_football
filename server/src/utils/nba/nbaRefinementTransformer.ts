/**
 * NBA boxscore refinement transformer.
 * Transforms raw NBA.com boxscore data into a normalized format
 * consistent with our NFL refined data structure.
 */

import { createLogger } from '../logger';

const logger = createLogger('nbaRefinementTransformer');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayerStats {
  points: number;
  rebounds: number;
  reboundsOffensive: number;
  reboundsDefensive: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  foulsPersonal: number;
  foulsTechnical: number;
  minutes: string;
  minutesCalculated: string;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalsPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointersPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowsPercentage: number;
  plusMinus: number;
  starter: boolean;
  oncourt: boolean;
}

export interface RefinedPlayer {
  athleteId: string;
  personId: number;
  fullName: string;
  firstName: string;
  lastName: string;
  position: string;
  jersey: string;
  stats: PlayerStats;
}

export interface TeamStats {
  points: number;
  rebounds: number;
  reboundsOffensive: number;
  reboundsDefensive: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  foulsPersonal: number;
  foulsTechnical: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalsPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointersPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowsPercentage: number;
  fastBreakPoints: number;
  pointsInThePaint: number;
  pointsFromTurnovers: number;
  benchPoints: number;
  biggestLead: number;
}

export interface RefinedTeam {
  teamId: string;
  abbreviation: string;
  displayName: string;
  name: string;
  city: string;
  score: number;
  stats: TeamStats;
  players: RefinedPlayer[];
  homeAway: 'home' | 'away';
  periods: Array<{ period: number; score: number }>;
  timeoutsRemaining: number;
  inBonus: boolean;
}

export interface RefinedNbaGame {
  eventId: string;
  generatedAt: string;
  source: string;
  status: string;
  statusText: string;
  period: number;
  gameClock: string;
  arena: string;
  attendance: number | null;
  teams: RefinedTeam[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapGameStatus(gameStatus: number, statusText: string): string {
  switch (gameStatus) {
    case 1:
      return 'STATUS_SCHEDULED';
    case 2:
      // Check for halftime or end of period
      const lowerText = statusText.toLowerCase();
      if (lowerText.includes('half')) {
        return 'STATUS_HALFTIME';
      }
      if (lowerText.includes('end') && lowerText.includes('period')) {
        return 'STATUS_END_PERIOD';
      }
      return 'STATUS_IN_PROGRESS';
    case 3:
      return 'STATUS_FINAL';
    default:
      return 'STATUS_UNKNOWN';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Stats Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractPlayerStats(rawStats: Record<string, unknown>, rawPlayer: Record<string, unknown>): PlayerStats {
  return {
    points: Number(rawStats.points ?? 0),
    rebounds: Number(rawStats.reboundsTotal ?? 0),
    reboundsOffensive: Number(rawStats.reboundsOffensive ?? 0),
    reboundsDefensive: Number(rawStats.reboundsDefensive ?? 0),
    assists: Number(rawStats.assists ?? 0),
    steals: Number(rawStats.steals ?? 0),
    blocks: Number(rawStats.blocks ?? 0),
    turnovers: Number(rawStats.turnovers ?? 0),
    foulsPersonal: Number(rawStats.foulsPersonal ?? 0),
    foulsTechnical: Number(rawStats.foulsTechnical ?? 0),
    minutes: String(rawStats.minutes ?? 'PT00M00.00S'),
    minutesCalculated: String(rawStats.minutesCalculated ?? 'PT00M'),
    fieldGoalsMade: Number(rawStats.fieldGoalsMade ?? 0),
    fieldGoalsAttempted: Number(rawStats.fieldGoalsAttempted ?? 0),
    fieldGoalsPercentage: Number(rawStats.fieldGoalsPercentage ?? 0),
    threePointersMade: Number(rawStats.threePointersMade ?? 0),
    threePointersAttempted: Number(rawStats.threePointersAttempted ?? 0),
    threePointersPercentage: Number(rawStats.threePointersPercentage ?? 0),
    freeThrowsMade: Number(rawStats.freeThrowsMade ?? 0),
    freeThrowsAttempted: Number(rawStats.freeThrowsAttempted ?? 0),
    freeThrowsPercentage: Number(rawStats.freeThrowsPercentage ?? 0),
    plusMinus: Number(rawStats.plusMinusPoints ?? 0),
    starter: rawPlayer.starter === '1' || rawPlayer.starter === 1,
    oncourt: rawPlayer.oncourt === '1' || rawPlayer.oncourt === 1,
  };
}

function refinePlayer(rawPlayer: Record<string, unknown>): RefinedPlayer | null {
  // Skip inactive players only; include all ACTIVE players even if they haven't played yet
  const status = String(rawPlayer.status ?? '').toUpperCase();
  if (status === 'INACTIVE') {
    return null;
  }

  const rawStats = (rawPlayer.statistics as Record<string, unknown>) ?? {};

  return {
    athleteId: String(rawPlayer.personId ?? ''),
    personId: Number(rawPlayer.personId ?? 0),
    fullName: String(rawPlayer.name ?? ''),
    firstName: String(rawPlayer.firstName ?? ''),
    lastName: String(rawPlayer.familyName ?? ''),
    position: String(rawPlayer.position ?? ''),
    jersey: String(rawPlayer.jerseyNum ?? ''),
    stats: extractPlayerStats(rawStats, rawPlayer),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Stats Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractTeamStats(rawStats: Record<string, unknown>): TeamStats {
  return {
    points: Number(rawStats.points ?? 0),
    rebounds: Number(rawStats.reboundsTotal ?? 0),
    reboundsOffensive: Number(rawStats.reboundsOffensive ?? 0),
    reboundsDefensive: Number(rawStats.reboundsDefensive ?? 0),
    assists: Number(rawStats.assists ?? 0),
    steals: Number(rawStats.steals ?? 0),
    blocks: Number(rawStats.blocks ?? 0),
    turnovers: Number(rawStats.turnoversTotal ?? rawStats.turnovers ?? 0),
    foulsPersonal: Number(rawStats.foulsPersonal ?? 0),
    foulsTechnical: Number(rawStats.foulsTechnical ?? 0),
    fieldGoalsMade: Number(rawStats.fieldGoalsMade ?? 0),
    fieldGoalsAttempted: Number(rawStats.fieldGoalsAttempted ?? 0),
    fieldGoalsPercentage: Number(rawStats.fieldGoalsPercentage ?? 0),
    threePointersMade: Number(rawStats.threePointersMade ?? 0),
    threePointersAttempted: Number(rawStats.threePointersAttempted ?? 0),
    threePointersPercentage: Number(rawStats.threePointersPercentage ?? 0),
    freeThrowsMade: Number(rawStats.freeThrowsMade ?? 0),
    freeThrowsAttempted: Number(rawStats.freeThrowsAttempted ?? 0),
    freeThrowsPercentage: Number(rawStats.freeThrowsPercentage ?? 0),
    fastBreakPoints: Number(rawStats.pointsFastBreak ?? 0),
    pointsInThePaint: Number(rawStats.pointsInThePaint ?? 0),
    pointsFromTurnovers: Number(rawStats.pointsFromTurnovers ?? 0),
    benchPoints: Number(rawStats.benchPoints ?? 0),
    biggestLead: Number(rawStats.biggestLead ?? 0),
  };
}

function refineTeam(
  rawTeam: Record<string, unknown>,
  homeAway: 'home' | 'away'
): RefinedTeam {
  const rawPlayers = (rawTeam.players as Array<Record<string, unknown>>) ?? [];
  const refinedPlayers: RefinedPlayer[] = [];

  for (const rawPlayer of rawPlayers) {
    const player = refinePlayer(rawPlayer);
    if (player) {
      refinedPlayers.push(player);
    }
  }

  const rawStats = (rawTeam.statistics as Record<string, unknown>) ?? {};
  const rawPeriods = (rawTeam.periods as Array<Record<string, unknown>>) ?? [];

  const periods = rawPeriods.map((p) => ({
    period: Number(p.period ?? 0),
    score: Number(p.score ?? 0),
  }));

  return {
    teamId: String(rawTeam.teamId ?? ''),
    abbreviation: String(rawTeam.teamTricode ?? ''),
    displayName: `${rawTeam.teamCity ?? ''} ${rawTeam.teamName ?? ''}`.trim(),
    name: String(rawTeam.teamName ?? ''),
    city: String(rawTeam.teamCity ?? ''),
    score: Number(rawTeam.score ?? 0),
    stats: extractTeamStats(rawStats),
    players: refinedPlayers,
    homeAway,
    periods,
    timeoutsRemaining: Number(rawTeam.timeoutsRemaining ?? 0),
    inBonus: rawTeam.inBonus === '1' || rawTeam.inBonus === 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Refinement Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refine a raw NBA boxscore into our normalized format.
 */
export function refineBoxscore(raw: unknown, gameId: string): RefinedNbaGame | null {
  try {
    const rawObj = raw as Record<string, unknown>;
    const game = rawObj.game as Record<string, unknown>;

    if (!game) {
      logger.warn({ gameId }, 'No game object found in raw boxscore');
      return null;
    }

    const homeTeamRaw = game.homeTeam as Record<string, unknown>;
    const awayTeamRaw = game.awayTeam as Record<string, unknown>;

    if (!homeTeamRaw || !awayTeamRaw) {
      logger.warn({ gameId }, 'Missing home or away team data');
      return null;
    }

  const gameStatus = Number(game.gameStatus ?? 1);
  const statusText = String(game.gameStatusText ?? '');

    const arena = game.arena as Record<string, unknown>;

    return {
      eventId: gameId,
      generatedAt: new Date().toISOString(),
      source: 'nba.com',
  status: mapGameStatus(gameStatus, statusText),
      statusText,
      period: Number(game.period ?? 0),
      gameClock: String(game.gameClock ?? ''),
      arena: String(arena?.arenaName ?? ''),
      attendance: game.attendance != null ? Number(game.attendance) : null,
      teams: [
        refineTeam(homeTeamRaw, 'home'),
        refineTeam(awayTeamRaw, 'away'),
      ],
    };
  } catch (err) {
    logger.error({ err, gameId }, 'Failed to refine NBA boxscore');
    return null;
  }
}
