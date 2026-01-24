/**
 * NBA Score Sorcerer Validator
 *
 * Validates NBA Score Sorcerer bets by monitoring NBA game feeds
 * and evaluating which team scores next.
 */

import { BetProposal } from '../../../../supabaseClient';
import {
  getHomeScore,
  getAwayScore,
  getHomeTeam,
  getAwayTeam,
  getGameStatus,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';

const league: League = 'NBA';

import { BaseValidatorService } from '../../../sharedUtils/baseValidatorService';
import {
  NBA_SCORE_SORCERER_BASELINE_EVENT,
  NBA_SCORE_SORCERER_CHANNEL,
  NBA_SCORE_SORCERER_LABEL,
  NBA_SCORE_SORCERER_MODE_KEY,
  NBA_SCORE_SORCERER_RESULT_EVENT,
  NBA_SCORE_SORCERER_STORE_PREFIX,
} from './constants';
import type {
  NbaScoreSorcererBaseline,
  NbaScoreSorcererConfig,
  NbaScoreSorcererSnapshot,
} from './evaluator';
import {
  evaluateNbaScoreSorcerer,
  homeChoiceLabel,
  awayChoiceLabel,
} from './evaluator';

class NbaScoreSorcererValidatorService extends BaseValidatorService<NbaScoreSorcererConfig, NbaScoreSorcererBaseline> {
  constructor() {
    super({
      league: 'NBA',
      modeKey: NBA_SCORE_SORCERER_MODE_KEY,
      channelName: NBA_SCORE_SORCERER_CHANNEL,
      storeKeyPrefix: NBA_SCORE_SORCERER_STORE_PREFIX,
      modeLabel: NBA_SCORE_SORCERER_LABEL,
      resultEvent: NBA_SCORE_SORCERER_RESULT_EVENT,
      baselineEvent: NBA_SCORE_SORCERER_BASELINE_EVENT,
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.captureBaseline(bet);
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.evaluateBet(bet, gameId);
    }
  }

  protected async onKernelReady(): Promise<void> {
    const pending = await this.listPendingBets();
    for (const bet of pending) {
      const baseline = await this.store.get(bet.bet_id);
      if (!baseline) {
        await this.captureBaseline(bet);
      }
    }
  }

  private async captureBaseline(
    bet: Partial<BetProposal> & { bet_id: string; league_game_id?: string | null },
  ): Promise<NbaScoreSorcererBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('missing config on baseline capture', { betId: bet.bet_id });
      return null;
    }

    const gameId = config.league_game_id || bet.league_game_id;
    if (!gameId) {
      await this.washBet(bet.bet_id, { reason: 'missing_game_id' }, 'Could not capture baseline because the game was not set.');
      return null;
    }

    const baseline = await buildNbaScoreSorcererBaselineFromAccessors(gameId, config, new Date().toISOString());
    if (!baseline) {
      await this.washBet(bet.bet_id, { reason: 'missing_game_data', gameId }, 'Could not capture baseline because game data was unavailable.');
      return null;
    }

    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, NBA_SCORE_SORCERER_BASELINE_EVENT, { ...baseline });
    return baseline;
  }

  private async evaluateBet(
    bet: BetProposal,
    gameId: string,
    updatedAt?: string | undefined,
  ): Promise<void> {
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('missing config on evaluate', { betId: bet.bet_id });
      return;
    }

    const gameIdToUse = config.league_game_id || gameId;

    let baseline = await this.store.get(bet.bet_id);
    if (!baseline) {
      baseline = await this.captureBaseline(bet);
    }
    if (!baseline || !gameIdToUse) return;

    // Build current snapshot
    const snapshot = await buildNbaScoreSnapshot(gameIdToUse);
    if (!snapshot) return;

    // Check if game has ended
    const status = await getGameStatus(league, gameIdToUse);
    const gameEnded = status === 'STATUS_FINAL';

    const evaluation = evaluateNbaScoreSorcerer(baseline, snapshot, config, gameEnded);
    if (!evaluation) return;

    if (evaluation.outcome === 'wash') {
      await this.washBet(
        bet.bet_id,
        {
          reason: 'simultaneous_scores',
          home_score: snapshot.homeScore,
          away_score: snapshot.awayScore,
          delta_home: snapshot.homeScore - baseline.homeScore,
          delta_away: snapshot.awayScore - baseline.awayScore,
        },
        'Both teams scored before a winner could be determined.',
      );
      return;
    }

    const winningChoice = evaluation.winningChoice;
    if (!winningChoice) return;

    await this.resolveWithWinner(bet.bet_id, winningChoice, {
      eventType: NBA_SCORE_SORCERER_RESULT_EVENT,
      payload: {
        outcome: winningChoice,
        decision: evaluation.outcome,
        home_score: snapshot.homeScore,
        away_score: snapshot.awayScore,
        delta_home: snapshot.homeScore - baseline.homeScore,
        delta_away: snapshot.awayScore - baseline.awayScore,
        home_choice: homeChoiceLabel(config),
        away_choice: awayChoiceLabel(config),
        reason: evaluation.reason,
        captured_at: this.normalizeTimestamp(updatedAt),
      },
    });
  }
}

export const nbaScoreSorcererValidator = new NbaScoreSorcererValidatorService();
export type NbaScoreSorcererValidatorType = NbaScoreSorcererValidatorService;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

async function buildNbaScoreSorcererBaselineFromAccessors(
  gameId: string,
  config: NbaScoreSorcererConfig,
  capturedAt: string,
): Promise<NbaScoreSorcererBaseline | null> {
  const [homeTeam, awayTeam, homeScoreRaw, awayScoreRaw] = await Promise.all([
    getHomeTeam(league, gameId),
    getAwayTeam(league, gameId),
    getHomeScore(league, gameId),
    getAwayScore(league, gameId),
  ]);

  if (!homeTeam && !awayTeam) return null;

  const homeScore = Number(homeScoreRaw) || 0;
  const awayScore = Number(awayScoreRaw) || 0;

  return {
    gameId,
    capturedAt,
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

async function buildNbaScoreSnapshot(gameId: string): Promise<NbaScoreSorcererSnapshot | null> {
  const [homeScoreRaw, awayScoreRaw] = await Promise.all([
    getHomeScore(league, gameId),
    getAwayScore(league, gameId),
  ]);

  const homeScore = Number(homeScoreRaw);
  const awayScore = Number(awayScoreRaw);

  if (isNaN(homeScore) && isNaN(awayScore)) return null;

  return {
    homeScore: homeScore || 0,
    awayScore: awayScore || 0,
  };
}
