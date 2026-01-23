import { normalizeNumber } from '../../../utils/number';
import { normalizeStatus } from '../../shared/utils';
import { choiceLabel } from '../../shared/teamUtils';
import {
  getHomeTeam,
  getAwayTeam,
  getScores,
  getGameStatus,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../services/leagueData';
import type { League } from '../../../types/league';
import { SCORE_SORCERER_NO_MORE_SCORES } from './constants';

const league: League = 'NFL';

export interface ScoreSorcererConfig {
  league_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  home_team_abbrev?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  away_team_abbrev?: string | null;
}

export interface ScoreSorcererBaseline {
  gameId: string;
  capturedAt: string;
  homeScore: number;
  awayScore: number;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeTeamAbbrev?: string | null;
  awayTeamAbbrev?: string | null;
}

export type ScoreSorcererDecision = 'home' | 'away' | 'simultaneous' | 'no_more_scores';

export interface ScoreSorcererEvaluation {
  decision: ScoreSorcererDecision;
  homeScore: number;
  awayScore: number;
  deltaHome: number;
  deltaAway: number;
}

export async function buildScoreSorcererBaseline(
  config: ScoreSorcererConfig,
  gameId: string,
  capturedAt: string,
): Promise<ScoreSorcererBaseline | null> {
  const snapshot = await readScoreSnapshot({ ...config, league_game_id: gameId });
  if (!snapshot) return null;
  return {
    gameId,
    capturedAt,
    homeScore: snapshot.homeScore,
    awayScore: snapshot.awayScore,
    homeTeamId: snapshot.homeTeamId,
    awayTeamId: snapshot.awayTeamId,
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    homeTeamAbbrev: snapshot.homeTeamAbbrev,
    awayTeamAbbrev: snapshot.awayTeamAbbrev,
  };
}

export async function evaluateScoreSorcerer(
  gameId: string | null | undefined,
  baseline: ScoreSorcererBaseline | null | undefined,
): Promise<ScoreSorcererEvaluation | null> {
  if (!gameId || !baseline) return null;

  const snapshot = await readScoreSnapshot({
    league_game_id: gameId,
    home_team_id: baseline.homeTeamId,
    away_team_id: baseline.awayTeamId,
    home_team_name: baseline.homeTeamName,
    away_team_name: baseline.awayTeamName,
    home_team_abbrev: baseline.homeTeamAbbrev,
    away_team_abbrev: baseline.awayTeamAbbrev,
  });
  if (!snapshot) return null;

  const deltaHome = Math.max(0, snapshot.homeScore - baseline.homeScore);
  const deltaAway = Math.max(0, snapshot.awayScore - baseline.awayScore);

  if (deltaHome > 0 && deltaAway <= 0) {
    return { decision: 'home', homeScore: snapshot.homeScore, awayScore: snapshot.awayScore, deltaHome, deltaAway };
  }
  if (deltaAway > 0 && deltaHome <= 0) {
    return { decision: 'away', homeScore: snapshot.homeScore, awayScore: snapshot.awayScore, deltaHome, deltaAway };
  }
  if (deltaHome > 0 && deltaAway > 0) {
    return { decision: 'simultaneous', homeScore: snapshot.homeScore, awayScore: snapshot.awayScore, deltaHome, deltaAway };
  }

  const status = normalizeStatus(await getGameStatus(league, gameId));

  if (status === 'STATUS_FINAL') {
    return { decision: 'no_more_scores', homeScore: snapshot.homeScore, awayScore: snapshot.awayScore, deltaHome, deltaAway };
  }

  return null;
}

export function homeChoiceLabel(config: ScoreSorcererConfig): string {
  return choiceLabel(config.home_team_name, config.home_team_abbrev ?? config.home_team_id, 'Home Team');
}

export function awayChoiceLabel(config: ScoreSorcererConfig): string {
  return choiceLabel(config.away_team_name, config.away_team_abbrev ?? config.away_team_id, 'Away Team');
}

export function noMoreScoresChoice(): string {
  return SCORE_SORCERER_NO_MORE_SCORES;
}

async function readScoreSnapshot(config: ScoreSorcererConfig): Promise<
  | (ScoreSorcererBaseline & { deltaHome?: number; deltaAway?: number })
  | null
> {
  const gameId = config.league_game_id;
  if (!gameId) return null;

  const [homeTeam, awayTeam, scores] = await Promise.all([
    getHomeTeam(league, gameId),
    getAwayTeam(league, gameId),
    getScores(league, gameId),
  ]);

  if (!homeTeam && !awayTeam) return null;

  const homeScore = normalizeNumber(scores.home);
  const awayScore = normalizeNumber(scores.away);

  return {
    gameId,
    capturedAt: '', // caller sets
    homeScore,
    awayScore,
    homeTeamId: extractTeamId(homeTeam) ?? config.home_team_id ?? null,
    awayTeamId: extractTeamId(awayTeam) ?? config.away_team_id ?? null,
    homeTeamName: extractTeamName(homeTeam) ?? config.home_team_name ?? null,
    awayTeamName: extractTeamName(awayTeam) ?? config.away_team_name ?? null,
    homeTeamAbbrev: extractTeamAbbreviation(homeTeam) ?? config.home_team_abbrev ?? null,
    awayTeamAbbrev: extractTeamAbbreviation(awayTeam) ?? config.away_team_abbrev ?? null,
  };
}
