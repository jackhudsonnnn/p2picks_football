import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { RefinedGameDoc } from '../../../utils/gameData';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT } from './constants';
import { ModeRuntimeKernel } from '../../shared/modeRuntimeKernel';
import { betRepository } from '../../shared/betRepository';
import { washBetWithHistory } from '../../shared/washService';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { ensureRefinedGameDoc, normalizeStatus } from '../../shared/gameDocProvider';
import { formatNumber, isApproximatelyEqual } from '../../shared/numberUtils';
import {
  PropHuntBaseline,
  PropHuntConfig,
  evaluateLineCrossed,
  evaluatePropHunt,
  normalizePropHuntLine,
  normalizePropHuntProgressMode,
  readStatValue,
} from './evaluator';

export class PropHuntValidatorService {
  private readonly kernel: ModeRuntimeKernel;
  private readonly baselineStore: RedisJsonStore<PropHuntBaseline>;
  private readonly resultEvent = 'prop_hunt_result';
  private readonly baselineEvent = 'prop_hunt_baseline';
  private readonly modeLabel = 'Prop Hunt';

  constructor() {
    const redis = getRedisClient();
    this.baselineStore = new RedisJsonStore(redis, 'propHunt:baseline', 60 * 60 * 12);
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'prop_hunt',
      channelName: 'prop-hunt-pending',
      dedupeGameFeed: true,
      onPendingUpdate: (payload) => this.handleBetProposalUpdate(payload),
      onPendingDelete: (payload) => this.handleBetProposalDelete(payload),
      onGameEvent: (event) => this.handleGameFeedEvent(event.gameId, event.doc),
      onReady: () => this.syncPendingBaselines(),
    });
  }

  start(): void {
    this.kernel.start();
  }

  stop(): void {
    this.kernel.stop();
  }

  private async handleBetProposalUpdate(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const next = (payload.new || {}) as Partial<BetProposal>;
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (!next.bet_id) return;
      if (next.bet_status === 'pending' && prev.bet_status !== 'pending') {
        await this.handlePendingTransition(next as BetProposal);
      }
      const exitedPending = next.bet_status !== 'pending' && prev.bet_status === 'pending';
      if (exitedPending || (next.winning_choice && !prev.winning_choice)) {
        await this.baselineStore.delete(next.bet_id);
      }
    } catch (err) {
      console.error('[propHunt] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (prev.bet_id) {
        await this.baselineStore.delete(prev.bet_id);
      }
    } catch (err) {
      console.error('[propHunt] pending delete handler error', err);
    }
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const pending = await betRepository.listPendingBets('prop_hunt');
      for (const bet of pending) {
        await this.captureBaselineForBet(bet);
      }
    } catch (err) {
      console.error('[propHunt] sync pending bets failed', err);
    }
  }

  private async handlePendingTransition(bet: BetProposal): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[propHunt] missing config on pending transition', { bet_id: bet.bet_id });
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
      const doc = await this.ensureGameDoc(config, bet);
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
      console.error('[propHunt] pending transition error', { bet_id: bet.bet_id }, err);
    }
  }

  private async handleGameFeedEvent(gameId: string, doc: RefinedGameDoc): Promise<void> {
    try {
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
    } catch (err) {
      console.error('[propHunt] game feed event error', { gameId }, err);
    }
  }

  private async processGame(gameId: string, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
    try {
      const bets = await betRepository.listPendingBets('prop_hunt', { gameId });
      for (const bet of bets) {
        await this.resolveBet(bet, doc, resolveAt);
      }
    } catch (err) {
      console.error('[propHunt] process game error', { gameId }, err);
    }
  }

  private async resolveBet(bet: BetProposal, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[propHunt] missing config; skipping bet', { bet_id: bet.bet_id });
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
        console.warn('[propHunt] baseline unavailable for Starting Now; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const evaluation = evaluatePropHunt(doc, config, line, progressMode, baseline ?? undefined);
      if (!evaluation) {
        console.warn('[propHunt] evaluation unavailable; skipping bet', { bet_id: bet.bet_id });
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
        await this.baselineStore.delete(bet.bet_id);
        return;
      }
      const winningChoice = evaluation.metricValue > line ? 'Over' : 'Under';
      const updated = await betRepository.setWinningChoice(bet.bet_id, winningChoice);
      if (!updated) return;
      await betRepository.recordHistory(bet.bet_id, this.resultEvent, {
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
      await this.baselineStore.delete(bet.bet_id);
    } catch (err) {
      console.error('[propHunt] resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async ensureBaseline(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    doc: RefinedGameDoc,
    config: PropHuntConfig,
  ): Promise<PropHuntBaseline | null> {
    const existing = await this.baselineStore.get(bet.bet_id);
    if (existing) {
      return existing;
    }
    return this.captureBaselineForBet(bet, doc, config);
  }

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    await washBetWithHistory({
      betId,
      payload: { outcome: 'wash', ...payload },
      explanation,
      eventType: this.resultEvent,
      modeLabel: this.modeLabel,
    });
    await this.baselineStore.delete(betId);
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
    existingConfig?: PropHuntConfig | null,
  ): Promise<PropHuntBaseline | null> {
    const cached = await this.baselineStore.get(bet.bet_id);
    if (cached) {
      return cached;
    }
    const config = existingConfig ?? (await this.getConfigForBet(bet.bet_id));
    if (!config) {
      console.warn('[propHunt] cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }
    const progressMode = normalizePropHuntProgressMode(config.progress_mode);
    if (progressMode !== 'starting_now') {
      return null;
    }
    const statKey = (config.stat || '').trim();
    if (!statKey) {
      console.warn('[propHunt] config missing stat key for baseline', { bet_id: bet.bet_id });
      return null;
    }
    const gameId = config.nfl_game_id || bet.nfl_game_id || null;
    if (!gameId) {
      console.warn('[propHunt] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    const doc = await ensureRefinedGameDoc(gameId, prefetchedDoc ?? null);
    if (!doc) {
      console.warn('[propHunt] refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
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
    await this.baselineStore.set(bet.bet_id, baseline);
    await betRepository.recordHistory(bet.bet_id, this.baselineEvent, {
      stat_key: baseline.statKey,
      player: baseline.player,
      value: baseline.value,
      captured_at: baseline.capturedAt,
      progress_mode: progressMode,
    });
    return baseline;
  }

  private async ensureGameDoc(
    config: PropHuntConfig,
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
  ): Promise<RefinedGameDoc | null> {
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      return null;
    }
    return ensureRefinedGameDoc(gameId, null);
  }

  private async getConfigForBet(betId: string): Promise<PropHuntConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'prop_hunt') return null;
      return record.data as PropHuntConfig;
    } catch (err) {
      console.error('[propHunt] fetch config error', { betId }, err);
      return null;
    }
  }
}

export const propHuntValidator = new PropHuntValidatorService();
