import { getGameStatus } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { formatNumber } from '../../../../utils/number';
import { BaseValidatorService } from '../../../sharedUtils/baseValidatorService';
import {
  NBA_SPREAD_THE_WEALTH_BASELINE_EVENT,
  NBA_SPREAD_THE_WEALTH_CHANNEL,
  NBA_SPREAD_THE_WEALTH_LABEL,
  NBA_SPREAD_THE_WEALTH_MODE_KEY,
  NBA_SPREAD_THE_WEALTH_RESULT_EVENT,
  NBA_SPREAD_THE_WEALTH_STORE_PREFIX,
} from './constants';
import {
  NbaSpreadTheWealthConfig,
  describeSpread,
  evaluateSpreadTheWealth,
  normalizeSpread,
} from './evaluator';

class NbaSpreadTheWealthValidatorService extends BaseValidatorService<NbaSpreadTheWealthConfig, Record<string, never>> {
  constructor() {
    super({
      league: 'NBA',
      modeKey: NBA_SPREAD_THE_WEALTH_MODE_KEY,
      channelName: NBA_SPREAD_THE_WEALTH_CHANNEL,
      storeKeyPrefix: NBA_SPREAD_THE_WEALTH_STORE_PREFIX,
      modeLabel: NBA_SPREAD_THE_WEALTH_LABEL,
      resultEvent: NBA_SPREAD_THE_WEALTH_RESULT_EVENT,
      baselineEvent: NBA_SPREAD_THE_WEALTH_BASELINE_EVENT,
      storeTtlSeconds: 60 * 60,
    });
  }

  protected async onBetBecamePending(): Promise<void> {
    // no baseline/state to capture
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const league: League = 'NBA';
    const status = await getGameStatus(league, gameId);
    if (status !== 'STATUS_FINAL') return;
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.resolveBet(bet.bet_id);
    }
  }

  protected async onKernelReady(): Promise<void> {
    // nothing to sync
  }

  private async resolveBet(betId: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) return;
      const spread = normalizeSpread(config);
      if (spread == null) {
        await this.washBet(
          betId,
          { reason: 'invalid_spread', config },
          describeSpread(config) ?? 'Invalid spread configuration.',
        );
        return;
      }

      const evaluation = await evaluateSpreadTheWealth(config, spread);
      const allowsTie = Number.isInteger(spread);

      const homeChoice = config.home_team_name ?? 'Home Team';
      const awayChoice = config.away_team_name ?? 'Away Team';

      if (evaluation.decision === 'tie') {
        if (!allowsTie) {
          await this.washBet(
            betId,
            {
              reason: 'push',
              home_score: evaluation.homeScore,
              away_score: evaluation.awayScore,
              spread,
            },
            `Adjusted home score matched away score (${formatNumber(evaluation.adjustedHomeScore)} vs ${formatNumber(
              evaluation.awayScore,
            )}).`,
          );
          return;
        }
        await this.resolveWithWinner(betId, 'Tie', {
          eventType: NBA_SPREAD_THE_WEALTH_RESULT_EVENT,
          payload: {
            outcome: 'Tie',
            home_score: evaluation.homeScore,
            away_score: evaluation.awayScore,
            adjusted_home: evaluation.adjustedHomeScore,
            spread,
            spread_label: config.spread_label ?? config.spread ?? null,
            captured_at: new Date().toISOString(),
          },
        });
        return;
      }

      const winningChoice = allowsTie
        ? evaluation.decision === 'home'
          ? 'Over'
          : 'Under'
        : evaluation.decision === 'home'
        ? homeChoice
        : awayChoice;
      await this.resolveWithWinner(betId, winningChoice, {
        eventType: NBA_SPREAD_THE_WEALTH_RESULT_EVENT,
        payload: {
          outcome: winningChoice,
          home_score: evaluation.homeScore,
          away_score: evaluation.awayScore,
          adjusted_home: evaluation.adjustedHomeScore,
          spread,
          spread_label: config.spread_label ?? config.spread ?? null,
          captured_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logError('resolve bet error', { betId }, err);
    }
  }
}

export const nbaSpreadTheWealthValidator = new NbaSpreadTheWealthValidatorService();
export type NbaSpreadTheWealthValidatorType = NbaSpreadTheWealthValidatorService;
