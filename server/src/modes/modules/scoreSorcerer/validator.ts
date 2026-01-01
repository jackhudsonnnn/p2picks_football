import { BetProposal } from '../../../supabaseClient';
import {
  RefinedGameDoc,
  getHomeScore,
  getAwayScore,
  getHomeTeam,
  getAwayTeam,
  extractTeamAbbreviation,
  extractTeamId,
  extractTeamName,
} from '../../../services/nflData/nflRefinedDataAccessors';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import {
  SCORE_SORCERER_BASELINE_EVENT,
  SCORE_SORCERER_CHANNEL,
  SCORE_SORCERER_LABEL,
  SCORE_SORCERER_MODE_KEY,
  SCORE_SORCERER_RESULT_EVENT,
  SCORE_SORCERER_STORE_PREFIX,
} from './constants';
import {
  ScoreSorcererBaseline,
  ScoreSorcererConfig,
  awayChoiceLabel,
  evaluateScoreSorcerer,
  homeChoiceLabel,
  noMoreScoresChoice,
} from './evaluator';

class ScoreSorcererValidatorService extends BaseValidatorService<ScoreSorcererConfig, ScoreSorcererBaseline> {
  constructor() {
    super({
      modeKey: SCORE_SORCERER_MODE_KEY,
      channelName: SCORE_SORCERER_CHANNEL,
      storeKeyPrefix: SCORE_SORCERER_STORE_PREFIX,
      modeLabel: SCORE_SORCERER_LABEL,
      resultEvent: SCORE_SORCERER_RESULT_EVENT,
      baselineEvent: SCORE_SORCERER_BASELINE_EVENT,
      debugEnvVar: 'DEBUG_SCORE_SORCERER',
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.captureBaseline(bet, null);
  }

  protected async onGameUpdate(gameId: string, doc: RefinedGameDoc, updatedAt?: string | undefined): Promise<void> {
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.evaluateBet(bet, doc, updatedAt);
    }
  }

  protected async onKernelReady(): Promise<void> {
    const pending = await this.listPendingBets();
    for (const bet of pending) {
      const baseline = await this.store.get(bet.bet_id);
      if (!baseline) {
        await this.captureBaseline(bet, null);
      }
    }
  }

  private async captureBaseline(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetched: RefinedGameDoc | null,
  ): Promise<ScoreSorcererBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('missing config on baseline capture', { betId: bet.bet_id });
      return null;
    }

    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      await this.washBet(bet.bet_id, { reason: 'missing_game_id' }, 'Could not capture baseline because the game was not set.');
      return null;
    }

    const baseline = await buildScoreSorcererBaselineFromAccessors(gameId, config, new Date().toISOString());
    if (!baseline) {
      await this.washBet(bet.bet_id, { reason: 'missing_game_doc', gameId }, 'Could not capture baseline because game data was unavailable.');
      return null;
    }
    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, SCORE_SORCERER_BASELINE_EVENT, { ...baseline });
    this.logDebug('baseline_captured', { betId: bet.bet_id, baseline });
    return baseline;
  }

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc, updatedAt?: string | undefined): Promise<void> {
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('missing config on evaluate', { betId: bet.bet_id });
      return;
    }

    let baseline = await this.store.get(bet.bet_id);
    if (!baseline) {
      baseline = await this.captureBaseline(bet, doc);
    }
    if (!baseline) return;

    const evaluation = evaluateScoreSorcerer(doc, baseline);
    if (!evaluation) return;

    if (evaluation.decision === 'simultaneous') {
      await this.washBet(
        bet.bet_id,
        {
          reason: 'simultaneous_scores',
          home_score: evaluation.homeScore,
          away_score: evaluation.awayScore,
          delta_home: evaluation.deltaHome,
          delta_away: evaluation.deltaAway,
        },
        'Both teams scored before a winner could be determined.',
      );
      return;
    }

    const homeChoice = homeChoiceLabel(config);
    const awayChoice = awayChoiceLabel(config);
    const winningChoice =
      evaluation.decision === 'home'
        ? homeChoice
        : evaluation.decision === 'away'
        ? awayChoice
        : noMoreScoresChoice();

    await this.resolveWithWinner(bet.bet_id, winningChoice, {
      eventType: SCORE_SORCERER_RESULT_EVENT,
      payload: {
        outcome: winningChoice,
        decision: evaluation.decision,
        home_score: evaluation.homeScore,
        away_score: evaluation.awayScore,
        delta_home: evaluation.deltaHome,
        delta_away: evaluation.deltaAway,
        home_choice: homeChoice,
        away_choice: awayChoice,
        captured_at: this.normalizeTimestamp(updatedAt, doc.generatedAt),
      },
    });
  }
}

export const scoreSorcererValidator = new ScoreSorcererValidatorService();
export type ScoreSorcererValidatorType = ScoreSorcererValidatorService;

async function buildScoreSorcererBaselineFromAccessors(
  gameId: string,
  config: ScoreSorcererConfig,
  capturedAt: string,
): Promise<ScoreSorcererBaseline | null> {
  const [homeTeam, awayTeam, homeScoreRaw, awayScoreRaw] = await Promise.all([
    getHomeTeam(gameId),
    getAwayTeam(gameId),
    getHomeScore(gameId),
    getAwayScore(gameId),
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
