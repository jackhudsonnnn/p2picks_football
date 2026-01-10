import { RefinedGameDoc } from '../../../services/nflData/nflRefinedDataAccessors';
import { formatNumber } from '../../../utils/number';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/utils';
import { choiceLabel } from '../../shared/teamUtils';
import {
  SpreadTheWealthConfig,
  describeSpread,
  evaluateSpreadTheWealth,
  normalizeSpread,
} from './evaluator';

export class SpreadTheWealthValidatorService extends BaseValidatorService<SpreadTheWealthConfig, Record<string, never>> {
  constructor() {
    super({
      modeKey: 'spread_the_wealth',
      channelName: 'spread-the-wealth-pending',
      storeKeyPrefix: 'spreadTheWealth:noop',
      modeLabel: 'Spread The Wealth',
      resultEvent: 'spread_the_wealth_result',
      baselineEvent: 'spread_the_wealth_baseline',
      storeTtlSeconds: 60 * 60, // unused store, short TTL
    });
  }

  protected async onBetBecamePending(): Promise<void> {
    // no baseline/state to capture
  }

  protected async onGameUpdate(gameId: string, doc: RefinedGameDoc): Promise<void> {
    if (normalizeStatus(doc.status) !== 'STATUS_FINAL') return;
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.resolveBet(bet.bet_id, doc);
    }
  }

  protected async onKernelReady(): Promise<void> {
    // nothing to sync for this mode
  }

  private async resolveBet(betId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        this.logWarn('missing config; skipping bet', { betId });
        return;
      }
      const spread = normalizeSpread(config);
      if (spread == null) {
        await this.washBet(
          betId,
          { reason: 'invalid_spread', config },
          describeSpread(config) ?? 'Invalid spread configuration.',
        );
        return;
      }
      const evaluation = evaluateSpreadTheWealth(doc, config, spread);

      const allowsTie = Number.isInteger(spread);

      const homeChoice = choiceLabel(config.home_team_name, config.home_team_id, 'Home Team');
      const awayChoice = choiceLabel(config.away_team_name, config.away_team_id, 'Away Team');

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
          eventType: this.config.resultEvent,
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
        eventType: this.config.resultEvent,
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

export const spreadTheWealthValidator = new SpreadTheWealthValidatorService();
