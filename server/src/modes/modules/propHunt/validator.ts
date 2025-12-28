import { BetProposal } from '../../../supabaseClient';
import { RefinedGameDoc } from '../../../utils/refinedDocAccessors';
import { formatNumber, isApproximatelyEqual } from '../../../utils/number';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/gameDocProvider';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT } from './constants';
import {
  PropHuntBaseline,
  PropHuntConfig,
  evaluateLineCrossed,
  evaluatePropHunt,
  normalizePropHuntLine,
  normalizePropHuntProgressMode,
  readStatValue,
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

  protected async onGameUpdate(gameId: string, doc: RefinedGameDoc): Promise<void> {
    const status = normalizeStatus(doc.status);
    const halftimeOption =
      PROP_HUNT_ALLOWED_RESOLVE_AT.find((value) => value.toLowerCase() === 'halftime') ?? 'Halftime';

    if (status === 'STATUS_HALFTIME') {
      await this.processGame(gameId, doc, halftimeOption);
      return;
    }

    if (status === 'STATUS_FINAL') {
      await this.processGame(gameId, doc, halftimeOption);
      await this.processGame(gameId, doc, PROP_HUNT_DEFAULT_RESOLVE_AT);
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
      const doc = await this.fetchGameDoc(config, bet);
      if (progressMode === 'starting_now') {
        await this.captureBaselineForBet(bet, doc, config);
      }
      if (doc) {
        const check = evaluateLineCrossed(doc, config, line, progressMode);
        if (check.crossed) {
          await this.washBet(
            bet.bet_id,
            {
              reason: 'line_already_crossed',
              current_value: check.currentValue,
              line,
              progress_mode: progressMode,
              captured_at: new Date().toISOString(),
            },
            `Line (${formatNumber(line)}) already met before betting closed.`,
          );
        }
      }
    } catch (err) {
      this.logError('pending transition error', { bet_id: bet.bet_id }, err);
    }
  }

  private async processGame(gameId: string, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
    try {
      const bets = await this.listPendingBets({ gameId });
      for (const bet of bets) {
        await this.resolveBet(bet, doc, resolveAt);
      }
    } catch (err) {
      this.logError('process game error', { gameId, resolveAt }, err);
    }
  }

  private async resolveBet(bet: BetProposal, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
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
      const baseline = progressMode === 'starting_now' ? await this.ensureBaseline(bet, doc, config) : null;
      if (progressMode === 'starting_now' && !baseline) {
        this.logWarn('baseline unavailable for Starting Now; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const evaluation = evaluatePropHunt(doc, config, line, progressMode, baseline ?? undefined);
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
        await this.store.delete(bet.bet_id);
        return;
      }
      const winningChoice = evaluation.metricValue > line ? 'Over' : 'Under';
      const updated = await this.setWinningChoice(bet.bet_id, winningChoice);
      if (!updated) return;
      await this.recordHistory(bet.bet_id, this.config.resultEvent, {
        outcome: winningChoice,
        final_value: evaluation.finalValue,
        baseline_value: evaluation.baselineValue,
        metric_value: evaluation.metricValue,
        line,
        stat_key: evaluation.statKey,
        resolve_at: resolveAt,
        progress_mode: progressMode,
        captured_at: new Date().toISOString(),
      });
      await this.store.delete(bet.bet_id);
    } catch (err) {
      this.logError('resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async ensureBaseline(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    doc: RefinedGameDoc,
    config: PropHuntConfig,
  ): Promise<PropHuntBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) {
      return existing;
    }
    return this.captureBaselineForBet(bet, doc, config);
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
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
    const gameId = config.nfl_game_id || bet.nfl_game_id || null;
    if (!gameId) {
      this.logWarn('missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    const doc = await this.ensureGameDoc(gameId, prefetchedDoc ?? null);
    if (!doc) {
      this.logWarn('refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const value = readStatValue(doc, config);
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

  private async fetchGameDoc(
    config: PropHuntConfig,
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
  ): Promise<RefinedGameDoc | null> {
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) return null;
    return this.ensureGameDoc(gameId, null);
  }
}

export const propHuntValidator = new PropHuntValidatorService();
