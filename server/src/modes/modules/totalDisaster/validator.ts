import type { RefinedGameDoc } from '../../../services/nflData/nflRefinedDataService';
import { formatNumber } from '../../../utils/number';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/gameDocProvider';
import {
  TotalDisasterConfig,
  describeLine,
  evaluateTotalDisaster,
  normalizeLine,
} from './evaluator';

export class TotalDisasterValidatorService extends BaseValidatorService<TotalDisasterConfig, Record<string, never>> {
  constructor() {
    super({
      modeKey: 'total_disaster',
      channelName: 'total-disaster-pending',
      storeKeyPrefix: 'totalDisaster:noop',
      modeLabel: 'Total Disaster',
      resultEvent: 'total_disaster_result',
      baselineEvent: 'total_disaster_baseline',
      storeTtlSeconds: 60 * 60,
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
    // nothing to sync
  }

  private async resolveBet(betId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        this.logWarn('missing config; skipping bet', { betId });
        return;
      }
      const line = normalizeLine(config);
      if (line == null) {
        await this.washBet(
          betId,
          { reason: 'invalid_line', config },
          describeLine(config) ?? 'Invalid over/under line configuration.',
        );
        return;
      }
      const evaluation = evaluateTotalDisaster(doc, line);
      if (evaluation.decision === 'push') {
        await this.washBet(
          betId,
          {
            reason: 'push',
            total_points: evaluation.totalPoints,
            line: evaluation.line,
          },
          `Total points matched the line (${formatNumber(evaluation.totalPoints)} vs ${formatNumber(line)}).`,
        );
        return;
      }
      const winningChoice = evaluation.decision === 'over' ? 'Over' : 'Under';
      await this.resolveWithWinner(betId, winningChoice, {
        eventType: this.config.resultEvent,
        payload: {
          outcome: winningChoice,
          total_points: evaluation.totalPoints,
          line: evaluation.line,
          line_label: config.line_label ?? config.line ?? null,
          captured_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logError('resolve bet error', { betId }, err);
    }
  }
}

export const totalDisasterValidator = new TotalDisasterValidatorService();
