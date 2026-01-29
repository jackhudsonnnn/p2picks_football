import { getGameStatus } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { formatNumber } from '../../../../utils/number';
import { BaseValidatorService } from '../../../sharedUtils/baseValidatorService';
import {
  NBA_TOTAL_DISASTER_BASELINE_EVENT,
  NBA_TOTAL_DISASTER_CHANNEL,
  NBA_TOTAL_DISASTER_LABEL,
  NBA_TOTAL_DISASTER_MODE_KEY,
  NBA_TOTAL_DISASTER_RESULT_EVENT,
  NBA_TOTAL_DISASTER_STORE_PREFIX,
} from './constants';
import {
  NbaTotalDisasterConfig,
  describeLine,
  evaluateNbaTotalDisaster,
  normalizeLine,
} from './evaluator';

class NbaTotalDisasterValidatorService extends BaseValidatorService<NbaTotalDisasterConfig, Record<string, never>> {
  constructor() {
    super({
      league: 'NBA',
      modeKey: NBA_TOTAL_DISASTER_MODE_KEY,
      channelName: NBA_TOTAL_DISASTER_CHANNEL,
      storeKeyPrefix: NBA_TOTAL_DISASTER_STORE_PREFIX,
      modeLabel: NBA_TOTAL_DISASTER_LABEL,
      resultEvent: NBA_TOTAL_DISASTER_RESULT_EVENT,
      baselineEvent: NBA_TOTAL_DISASTER_BASELINE_EVENT,
      storeTtlSeconds: 60 * 60,
    });
  }

  protected async onBetBecamePending(): Promise<void> {
    // no baseline/state to capture
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const league: League = 'NBA';
    const status = await getGameStatus(league, gameId);

    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      const config = await this.getConfigForBet(bet.bet_id);
      const resolveAt = typeof config?.resolve_at === 'string' ? config.resolve_at : 'End of Game';

      const shouldResolve =
        resolveAt === 'Halftime'
          ? status === 'STATUS_HALFTIME' || status === 'STATUS_FINAL'
          : status === 'STATUS_FINAL';

      if (!shouldResolve) continue;
      await this.resolveBet(bet.bet_id, config ?? null);
    }
  }

  protected async onKernelReady(): Promise<void> {
    // nothing to sync
  }

  private async resolveBet(betId: string, cachedConfig: NbaTotalDisasterConfig | null = null): Promise<void> {
    try {
      const config = cachedConfig ?? (await this.getConfigForBet(betId));
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

      const gameId = String(config.league_game_id ?? '');
      if (!gameId) {
        await this.washBet(
          betId,
          { reason: 'missing_game_id', config },
          'No game ID available to resolve this bet.',
        );
        return;
      }

      const evaluation = await evaluateNbaTotalDisaster('NBA', gameId, line);
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

export const nbaTotalDisasterValidator = new NbaTotalDisasterValidatorService();
export type NbaTotalDisasterValidatorType = NbaTotalDisasterValidatorService;
