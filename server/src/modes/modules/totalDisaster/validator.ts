import { fetchModeConfig } from '../../../services/modeConfig';
import type { RefinedGameDoc } from '../../../utils/gameData';
import { ModeRuntimeKernel } from '../../shared/modeRuntimeKernel';
import { betRepository } from '../../shared/betRepository';
import { washBetWithHistory } from '../../shared/washService';
import { normalizeStatus } from '../../shared/gameDocProvider';
import { formatNumber } from '../../../utils/number';
import {
  TotalDisasterConfig,
  describeLine,
  evaluateTotalDisaster,
  normalizeLine,
} from './evaluator';

export class TotalDisasterValidatorService {
  private readonly kernel: ModeRuntimeKernel;
  private readonly modeLabel = 'Total Disaster';
  private readonly resultEvent = 'total_disaster_result';

  constructor() {
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'total_disaster',
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
      const bets = await betRepository.listPendingBets('total_disaster', { gameId });
      for (const bet of bets) {
        await this.resolveBet(bet.bet_id, doc);
      }
    } catch (err) {
      console.error('[totalDisaster] game feed error', { gameId }, err);
    }
  }

  private async resolveBet(betId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        console.warn('[totalDisaster] missing config; skipping bet', { betId });
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
      const updated = await betRepository.setWinningChoice(betId, winningChoice);
      if (!updated) return;
      await betRepository.recordHistory(betId, this.resultEvent, {
        outcome: winningChoice,
        total_points: evaluation.totalPoints,
        line: evaluation.line,
        line_label: config.line_label ?? config.line ?? null,
        captured_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[totalDisaster] resolve bet error', { betId }, err);
    }
  }

  private async getConfigForBet(betId: string): Promise<TotalDisasterConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'total_disaster') return null;
      return record.data as TotalDisasterConfig;
    } catch (err) {
      console.error('[totalDisaster] fetch config error', { betId }, err);
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

export const totalDisasterValidator = new TotalDisasterValidatorService();
