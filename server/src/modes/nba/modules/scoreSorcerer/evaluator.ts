/**
 * NBA Score Sorcerer Evaluator
 *
 * Evaluates NBA Score Sorcerer bets based on score changes.
 */

import { NBA_SCORE_SORCERER_NO_MORE_SCORES } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NbaScoreSorcererConfig {
  league_game_id?: string | null;
  home_team_id?: string | null;
  home_team_abbrev?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_abbrev?: string | null;
  away_team_name?: string | null;
}

export interface NbaScoreSorcererBaseline {
  gameId: string;
  capturedAt: string;
  homeScore: number;
  awayScore: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamAbbrev: string | null;
  awayTeamAbbrev: string | null;
}

export interface NbaScoreSorcererSnapshot {
  homeScore: number;
  awayScore: number;
}

export type NbaScoreSorcererResult = {
  outcome: 'home' | 'away' | 'no_more_scores' | 'wash';
  winningChoice: string | null;
  reason: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Choice Label Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function homeChoiceLabel(config: NbaScoreSorcererConfig): string {
  return config.home_team_name || config.home_team_abbrev || config.home_team_id || 'Home Team';
}

export function awayChoiceLabel(config: NbaScoreSorcererConfig): string {
  return config.away_team_name || config.away_team_abbrev || config.away_team_id || 'Away Team';
}

export function noMoreScoresChoice(): string {
  return NBA_SCORE_SORCERER_NO_MORE_SCORES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluator
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateNbaScoreSorcerer(
  baseline: NbaScoreSorcererBaseline,
  snapshot: NbaScoreSorcererSnapshot,
  config: NbaScoreSorcererConfig,
  gameEnded: boolean,
): NbaScoreSorcererResult | null {
  const homeDelta = snapshot.homeScore - baseline.homeScore;
  const awayDelta = snapshot.awayScore - baseline.awayScore;

  // No score change yet
  if (homeDelta === 0 && awayDelta === 0) {
    if (gameEnded) {
      return {
        outcome: 'no_more_scores',
        winningChoice: noMoreScoresChoice(),
        reason: 'Game ended with no additional scoring',
      };
    }
    return null; // Still waiting
  }

  // Both teams scored on same update - wash
  if (homeDelta > 0 && awayDelta > 0) {
    return {
      outcome: 'wash',
      winningChoice: null,
      reason: 'Both teams scored on the same update',
    };
  }

  // Home team scored
  if (homeDelta > 0) {
    return {
      outcome: 'home',
      winningChoice: homeChoiceLabel(config),
      reason: `${homeChoiceLabel(config)} scored first (+${homeDelta} points)`,
    };
  }

  // Away team scored
  if (awayDelta > 0) {
    return {
      outcome: 'away',
      winningChoice: awayChoiceLabel(config),
      reason: `${awayChoiceLabel(config)} scored first (+${awayDelta} points)`,
    };
  }

  return null;
}
