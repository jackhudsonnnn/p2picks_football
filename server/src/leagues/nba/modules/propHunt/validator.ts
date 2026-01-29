import { BetProposal } from '../../../../supabaseClient';
import { getGameStatus, getPlayerStat } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { formatNumber } from '../../../../utils/number';
import { BaseValidatorService } from '../../../sharedUtils/baseValidatorService';
import {
  NBA_PROP_HUNT_BASELINE_EVENT,
  NBA_PROP_HUNT_CHANNEL,
  NBA_PROP_HUNT_LABEL,
  NBA_PROP_HUNT_MODE_KEY,
  NBA_PROP_HUNT_RESULT_EVENT,
  NBA_PROP_HUNT_STORE_PREFIX,
} from './constants';
import {
  NbaPropHuntBaseline,
  NbaPropHuntConfig,
  describeLine,
  evaluateNbaPropHunt,
  normalizePropHuntLine,
  normalizePropHuntProgressMode,
  resolveStatKey,
} from './evaluator';
import { NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY } from './constants';

class NbaPropHuntValidatorService extends BaseValidatorService<NbaPropHuntConfig, NbaPropHuntBaseline> {
  constructor() {
    super({
      league: 'NBA',
      modeKey: NBA_PROP_HUNT_MODE_KEY,
      channelName: NBA_PROP_HUNT_CHANNEL,
      storeKeyPrefix: NBA_PROP_HUNT_STORE_PREFIX,
      modeLabel: NBA_PROP_HUNT_LABEL,
      resultEvent: NBA_PROP_HUNT_RESULT_EVENT,
      baselineEvent: NBA_PROP_HUNT_BASELINE_EVENT,
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.captureBaselineIfNeeded(bet);
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const league: League = 'NBA';
    const status = await getGameStatus(league, gameId);
    const pending = await this.listPendingBets({ gameId });

    const resolveAt = status === 'STATUS_FINAL' ? 'End of Game' : status === 'STATUS_HALFTIME' ? 'Halftime' : null;
    if (!resolveAt) return;

    for (const bet of pending) {
      await this.resolveBet(bet, resolveAt);
    }
  }

  protected async onKernelReady(): Promise<void> {
    const pending = await this.listPendingBets();
    for (const bet of pending) {
      await this.captureBaselineIfNeeded(bet);
    }
  }

  private async captureBaselineIfNeeded(
    bet: Partial<BetProposal> & { bet_id: string; league_game_id?: string | null },
  ): Promise<NbaPropHuntBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) return null;

    const progressMode = normalizePropHuntProgressMode(config.progress_mode);
    if (progressMode !== 'starting_now') return null;

    const gameId = config.league_game_id || bet.league_game_id || null;
    if (!gameId) return null;

    const statKey = resolveStatKey(config.stat);
    if (!statKey) return null;

    const value = await this.readStatValue(config, gameId);
    const baseline: NbaPropHuntBaseline = {
      statKey,
      capturedAt: new Date().toISOString(),
      gameId,
      player: { id: config.player_id, name: config.player_name },
      value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
    };
    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, NBA_PROP_HUNT_BASELINE_EVENT, { ...baseline });
    return baseline;
  }

  private async resolveBet(bet: BetProposal, resolveAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) return;

      const target = String(config.resolve_at || '').toLowerCase();
      if (target && target !== resolveAt.toLowerCase()) return;

      const line = normalizePropHuntLine(config);
      if (line == null) {
        await this.washBet(bet.bet_id, { reason: 'invalid_line', config }, describeLine(config) ?? 'Invalid line');
        return;
      }

      const progressMode = normalizePropHuntProgressMode(config.progress_mode);
      const baseline = progressMode === 'starting_now' ? await this.captureBaselineIfNeeded(bet) : null;
      if (progressMode === 'starting_now' && !baseline) return;

      const evaluation = await evaluateNbaPropHunt(config, progressMode, baseline ?? undefined);
      if (!evaluation) return;

      if (evaluation.metricValue === null || evaluation.statKey === null) return;

      if (Math.abs(evaluation.metricValue - line) < 1e-9) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'push',
            final_value: evaluation.finalValue,
            baseline_value: evaluation.baselineValue,
            metric_value: evaluation.metricValue,
            line,
            resolve_at: resolveAt,
            progress_mode: progressMode,
          },
          `Value matched the line (${formatNumber(line)}).`,
        );
        return;
      }

      const winningChoice = evaluation.metricValue > line ? 'Over' : 'Under';
      await this.resolveWithWinner(bet.bet_id, winningChoice, {
        eventType: NBA_PROP_HUNT_RESULT_EVENT,
        payload: {
          outcome: winningChoice,
          final_value: evaluation.finalValue,
          baseline_value: evaluation.baselineValue,
          metric_value: evaluation.metricValue,
          line,
          resolve_at: resolveAt,
          progress_mode: progressMode,
          captured_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logError('resolve bet error', { betId: bet.bet_id }, err);
    }
  }

  private async readStatValue(config: NbaPropHuntConfig, gameId: string): Promise<number | null> {
    const statKey = resolveStatKey(config.stat);
    if (!statKey) return null;
    const playerKey = config.player_id || (config.player_name ? `name:${config.player_name}` : null);
    if (!playerKey) return null;
  const category = NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey] || 'stats';
  const value = await getPlayerStat('NBA', gameId, playerKey, category, statKey);
    return Number.isFinite(value) ? Number(value) : null;
  }
}

export const nbaPropHuntValidator = new NbaPropHuntValidatorService();
export type NbaPropHuntValidatorType = NbaPropHuntValidatorService;
