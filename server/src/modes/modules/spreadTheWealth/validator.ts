import { fetchModeConfig } from '../../../services/modeConfig';
import { RefinedGameDoc } from '../../../utils/gameData';
import { ModeRuntimeKernel } from '../../shared/modeRuntimeKernel';
import { betRepository } from '../../shared/betRepository';
import { washBetWithHistory } from '../../shared/washService';
import { normalizeStatus } from '../../shared/gameDocProvider';
import { formatNumber } from '../../../utils/number';
import { choiceLabel } from '../../shared/teamUtils';
import {
  SpreadTheWealthConfig,
  describeSpread,
  evaluateSpreadTheWealth,
  normalizeSpread,
} from './evaluator';

export class SpreadTheWealthValidatorService {
  private readonly kernel: ModeRuntimeKernel;
  private readonly modeLabel = 'Spread The Wealth';
  private readonly resultEvent = 'spread_the_wealth_result';

  constructor() {
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'spread_the_wealth',
      dedupeGameFeed: true,
      onGameEvent: (event) => this.handleGameFeedEvent(event.gameId, event.doc),
    });
  }

  start(): void {
    this.kernel.start();
  }

  stop(): void {
    this.kernel.stop();
  }

  private async handleGameFeedEvent(gameId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      if (normalizeStatus(doc.status) !== 'STATUS_FINAL') return;
      const bets = await betRepository.listPendingBets('spread_the_wealth', { gameId });
      for (const bet of bets) {
        await this.resolveBet(bet.bet_id, doc);
      }
    } catch (err) {
      console.error('[spreadTheWealth] game feed error', { gameId }, err);
    }
  }

  private async resolveBet(betId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        console.warn('[spreadTheWealth] missing config; skipping bet', { betId });
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

        const updatedTie = await betRepository.setWinningChoice(betId, 'Tie');
        if (!updatedTie) return;
        await betRepository.recordHistory(betId, this.resultEvent, {
          outcome: 'Tie',
          home_score: evaluation.homeScore,
          away_score: evaluation.awayScore,
          adjusted_home: evaluation.adjustedHomeScore,
          spread,
          spread_label: config.spread_label ?? config.spread ?? null,
          captured_at: new Date().toISOString(),
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
      const updated = await betRepository.setWinningChoice(betId, winningChoice);
      if (!updated) return;
      await betRepository.recordHistory(betId, this.resultEvent, {
        outcome: winningChoice,
        home_score: evaluation.homeScore,
        away_score: evaluation.awayScore,
        adjusted_home: evaluation.adjustedHomeScore,
        spread,
        spread_label: config.spread_label ?? config.spread ?? null,
        captured_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[spreadTheWealth] resolve bet error', { betId }, err);
    }
  }

  private async getConfigForBet(betId: string): Promise<SpreadTheWealthConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'spread_the_wealth') return null;
      return record.data as SpreadTheWealthConfig;
    } catch (err) {
      console.error('[spreadTheWealth] fetch config error', { betId }, err);
      return null;
    }
  }

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    await washBetWithHistory({
      betId,
      payload,
      explanation,
      eventType: this.resultEvent,
      modeLabel: this.modeLabel,
    });
  }
}

export const spreadTheWealthValidator = new SpreadTheWealthValidatorService();
