import type { RefinedGameDoc } from '../../../services/nflData/nflRefinedDataAccessors';
import { normalizeNumber } from '../../../utils/number';
import { normalizeStatus } from '../../shared/utils';
import { choiceLabel } from '../../shared/teamUtils';
import { extractTeamAbbreviation, extractTeamId, extractTeamName, pickAwayTeam, pickHomeTeam } from '../../shared/utils';
import { SCORE_SORCERER_NO_MORE_SCORES } from './constants';

export interface ScoreSorcererConfig {
  nfl_game_id?: string | null;
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

export function buildScoreSorcererBaseline(
  doc: RefinedGameDoc,
  config: ScoreSorcererConfig,
  gameId: string,
  capturedAt: string,
): ScoreSorcererBaseline {
  const snapshot = readScoreSnapshot(doc, config);
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

export function evaluateScoreSorcerer(
  doc: RefinedGameDoc | null | undefined,
  baseline: ScoreSorcererBaseline | null | undefined,
): ScoreSorcererEvaluation | null {
  if (!doc || !baseline) return null;
  const snapshot = readScoreSnapshot(doc, {
    home_team_id: baseline.homeTeamId,
    away_team_id: baseline.awayTeamId,
    home_team_name: baseline.homeTeamName,
    away_team_name: baseline.awayTeamName,
    home_team_abbrev: baseline.homeTeamAbbrev,
    away_team_abbrev: baseline.awayTeamAbbrev,
  });

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

  const status = normalizeStatus((doc as any)?.status);
  if (status.includes('FINAL') || status === 'STATUS_END_PERIOD' || status === 'STATUS_CANCELED') {
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

function readScoreSnapshot(doc: RefinedGameDoc, config: ScoreSorcererConfig) {
  const homeTeam = pickHomeTeam(doc);
  const awayTeam = pickAwayTeam(doc, homeTeam);

  const homeScore = normalizeNumber((homeTeam as any)?.score);
  const awayScore = normalizeNumber((awayTeam as any)?.score);

  return {
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
