import { BetProposal } from '../../../../supabaseClient';
import { getPlayerStat, getGameStatus } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { formatNumber, isApproximatelyEqual } from '../../../../utils/number';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/utils';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT } from './constants';
import {
  PropHuntBaseline,
  PropHuntConfig,
  evaluatePropHunt,
  normalizePropHuntLine,
  normalizePropHuntProgressMode,
} from './evaluator';

export class PropHuntValidatorService extends BaseValidatorService<PropHuntConfig, PropHuntBaseline> {
  constructor() {
    super({
      modeKey: 'prop_hunt',
      channelName: 'prop-hunt-pending',
      storeKeyPrefix: 'propHunt:baseline',
      modeLabel: 'Prop Hunt',
      resultEvent: 'prop_hunt_result',
      baselineEvent: 'prop_hunt_baseline',
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.handlePendingTransition(bet);
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const league: League = 'NFL'; // Default for nfl_modes
    const status = normalizeStatus(await getGameStatus(league, gameId));
    const halftimeOption =
      PROP_HUNT_ALLOWED_RESOLVE_AT.find((value) => value.toLowerCase() === 'halftime') ?? 'Halftime';

    if (status === 'STATUS_HALFTIME') {
      await this.processGame(gameId, halftimeOption);
      return;
    }

    if (status === 'STATUS_FINAL') {
      await this.processGame(gameId, halftimeOption);
      await this.processGame(gameId, PROP_HUNT_DEFAULT_RESOLVE_AT);
    }
  }

  protected async onKernelReady(): Promise<void> {
    await this.syncPendingBaselines();
  }

  private async syncPendingBaselines(): Promise<void> {
    const pending = await this.listPendingBets();
    for (const bet of pending) {
      await this.captureBaselineForBet(bet);
    }
  }

  private async handlePendingTransition(bet: BetProposal): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        this.logWarn('missing config on pending transition', { bet_id: bet.bet_id });
        return;
      }
      const line = normalizePropHuntLine(config);
      if (line == null) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'invalid_line',
            config,
            captured_at: new Date().toISOString(),
          },
          'Invalid prop line configuration.',
        );
        return;
      }
      const progressMode = normalizePropHuntProgressMode(config.progress_mode);
      const gameId = config.league_game_id || null;
      if (progressMode === 'starting_now') {
  await this.captureBaselineForBet({ ...bet, league_game_id: gameId ?? undefined }, config);
      }

      const currentValue = await readStatValueFromAccessors(config, gameId);
      if (progressMode === 'cumulative' && currentValue !== null && currentValue >= line) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'line_already_crossed',
            current_value: currentValue,
            line,
            progress_mode: progressMode,
            captured_at: new Date().toISOString(),
          },
          `Line (${formatNumber(line)}) already met before betting closed.`,
        );
      }
    } catch (err) {
      this.logError('pending transition error', { bet_id: bet.bet_id }, err);
    }
  }

  private async processGame(gameId: string, resolveAt: string): Promise<void> {
    try {
      const bets = await this.listPendingBets({ gameId });
      for (const bet of bets) {
        await this.resolveBet(bet, resolveAt);
      }
    } catch (err) {
      this.logError('process game error', { gameId, resolveAt }, err);
    }
  }

  private async resolveBet(bet: BetProposal, resolveAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        this.logWarn('missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const targetResolve = String(config.resolve_at || PROP_HUNT_DEFAULT_RESOLVE_AT).trim().toLowerCase();
      if (targetResolve !== resolveAt.trim().toLowerCase()) {
        return;
      }
      const line = normalizePropHuntLine(config);
      if (line == null) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'invalid_line',
            config,
            captured_at: new Date().toISOString(),
          },
          'Invalid prop line configuration.',
        );
        return;
      }

      const progressMode = normalizePropHuntProgressMode(config.progress_mode);
      const baseline = progressMode === 'starting_now' ? await this.ensureBaseline(bet, config) : null;
      if (progressMode === 'starting_now' && !baseline) {
        this.logWarn('baseline unavailable for Starting Now; skipping bet', { bet_id: bet.bet_id });
        return;
      }

      const evaluation = await evaluatePropHunt(config, progressMode, baseline ?? undefined);
      if (!evaluation) {
        this.logWarn('evaluation unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }

      if (isApproximatelyEqual(evaluation.metricValue, line)) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'push',
            final_value: evaluation.finalValue,
            baseline_value: evaluation.baselineValue,
            metric_value: evaluation.metricValue,
            line,
            stat_key: evaluation.statKey,
            resolve_at: resolveAt,
            progress_mode: progressMode,
          },
          progressMode === 'starting_now'
            ? `Net progress (${formatNumber(evaluation.metricValue)}) matched the line.`
            : `Final value (${formatNumber(evaluation.metricValue)}) matched the line.`,
        );

        return;
      }
      const winningChoice = evaluation.metricValue > line ? 'Over' : 'Under';
      await this.resolveWithWinner(bet.bet_id, winningChoice, {
        eventType: this.config.resultEvent,
        payload: {
          outcome: winningChoice,
          final_value: evaluation.finalValue,
          baseline_value: evaluation.baselineValue,
          metric_value: evaluation.metricValue,
          line,
          stat_key: evaluation.statKey,
          resolve_at: resolveAt,
          progress_mode: progressMode,
          captured_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logError('resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async ensureBaseline(
    bet: Partial<BetProposal> & { bet_id: string; league_game_id?: string | null },
    config: PropHuntConfig,
  ): Promise<PropHuntBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) {
      return existing;
    }
    return this.captureBaselineForBet(bet, config);
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; league_game_id?: string | null },
    existingConfig?: PropHuntConfig | null,
  ): Promise<PropHuntBaseline | null> {
    const cached = await this.store.get(bet.bet_id);
    if (cached) {
      return cached;
    }
    const config = existingConfig ?? (await this.getConfigForBet(bet.bet_id));
    if (!config) {
      this.logWarn('cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }
    const progressMode = normalizePropHuntProgressMode(config.progress_mode);
    if (progressMode !== 'starting_now') {
      return null;
    }
    const statKey = (config.stat || '').trim();
    if (!statKey) {
      this.logWarn('config missing stat key for baseline', { bet_id: bet.bet_id });
      return null;
    }
  const gameId = config.league_game_id || bet.league_game_id || null;
    if (!gameId) {
      this.logWarn('missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
  const value = await readStatValueFromAccessors(config, gameId);
    const baseline: PropHuntBaseline = {
      statKey,
      capturedAt: new Date().toISOString(),
      gameId,
      player: { id: config.player_id, name: config.player_name },
      value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
    };
    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, this.config.baselineEvent, {
      stat_key: baseline.statKey,
      player: baseline.player,
      value: baseline.value,
      captured_at: baseline.capturedAt,
      progress_mode: progressMode,
    });
    return baseline;
  }
}

export const propHuntValidator = new PropHuntValidatorService();

async function readStatValueFromAccessors(config: PropHuntConfig, gameId?: string | null, league: League = 'NFL'): Promise<number | null> {
  const statKey = (config.stat || '').trim();
  const spec = STAT_ACCESSOR_MAP[statKey];
  if (!spec) return null;
  const playerId = config.player_id || (config.player_name ? `name:${config.player_name.trim()}` : null);
  const resolvedGameId = gameId ?? config.league_game_id ?? null;
  if (!playerId || !resolvedGameId) return null;
  const value = await getPlayerStat(league, resolvedGameId, playerId, spec.category, spec.field);
  return Number.isFinite(value) ? value : null;
}

const STAT_ACCESSOR_MAP: Record<string, { category: string; field: string }> = {
  passingYards: { category: 'passing', field: 'passingYards' },
  passingTouchdowns: { category: 'passing', field: 'passingTouchdowns' },
  rushingYards: { category: 'rushing', field: 'rushingYards' },
  rushingTouchdowns: { category: 'rushing', field: 'rushingTouchdowns' },
  longRushing: { category: 'rushing', field: 'longRushing' },
  receptions: { category: 'receiving', field: 'receptions' },
  receivingYards: { category: 'receiving', field: 'receivingYards' },
  receivingTouchdowns: { category: 'receiving', field: 'receivingTouchdowns' },
  longReception: { category: 'receiving', field: 'longReception' },
  totalTackles: { category: 'defensive', field: 'totalTackles' },
  sacks: { category: 'defensive', field: 'sacks' },
  passesDefended: { category: 'defensive', field: 'passesDefended' },
  interceptions: { category: 'interceptions', field: 'interceptions' },
  kickReturnYards: { category: 'kickReturns', field: 'kickReturnYards' },
  longKickReturn: { category: 'kickReturns', field: 'longKickReturn' },
  puntReturnYards: { category: 'puntReturns', field: 'puntReturnYards' },
  longPuntReturn: { category: 'puntReturns', field: 'longPuntReturn' },
  puntsInside20: { category: 'punting', field: 'puntsInside20' },
  longPunt: { category: 'punting', field: 'longPunt' },
};
