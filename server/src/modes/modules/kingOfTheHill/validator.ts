import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { RefinedGameDoc } from '../../../utils/gameData';
import { ModeRuntimeKernel } from '../../shared/modeRuntimeKernel';
import { betRepository } from '../../shared/betRepository';
import { washBetWithHistory } from '../../shared/washService';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { ensureRefinedGameDoc, normalizeStatus } from '../../shared/gameDocProvider';
import { normalizeProgressMode } from '../../shared/playerStatUtils';
import { clampResolveValue, KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE } from './constants';
import {
  KingOfTheHillConfig,
  ProgressRecord,
  applyProgressUpdate,
  buildProgressRecord,
  determineProgressOutcome,
  readPlayerStat,
  resolveStatKey,
  type PlayerProgress,
} from './evaluator';

const DEBUG_KING_OF_THE_HILL = process.env.DEBUG_KING_OF_THE_HILL === '1' || process.env.DEBUG_KING_OF_THE_HILL === 'true';

export class KingOfTheHillValidatorService {
  private readonly kernel: ModeRuntimeKernel;
  private readonly progressStore: RedisJsonStore<ProgressRecord>;
  private readonly modeLabel = 'King Of The Hill';
  private readonly resultEvent = 'king_of_the_hill_result';
  private readonly snapshotEvent = 'king_of_the_hill_snapshot';
  private readonly debugEnabled = DEBUG_KING_OF_THE_HILL;
  private readonly initializingBets = new Set<string>();

  constructor() {
    const redis = getRedisClient();
    this.progressStore = new RedisJsonStore(redis, 'kingOfTheHill:progress', 60 * 60 * 12);
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'king_of_the_hill',
      channelName: 'king-of-the-hill-pending',
      dedupeGameFeed: true,
      onPendingUpdate: (payload) => this.handleBetProposalUpdate(payload),
      onPendingDelete: (payload) => this.handleBetProposalDelete(payload),
      onGameEvent: (event) => this.processGameUpdate(event.gameId, event.doc, event.updatedAt),
      onReady: () => this.syncPendingProgress(),
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
        await this.initializeProgressForBet(next as BetProposal);
      }
      const exitingPending = next.bet_status !== 'pending' && prev.bet_status === 'pending';
      if (exitingPending || (next.winning_choice && !prev.winning_choice)) {
        await this.progressStore.delete(next.bet_id);
      }
    } catch (err) {
      console.error('[kingOfTheHill] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (prev.bet_id) {
        await this.progressStore.delete(prev.bet_id);
      }
    } catch (err) {
      console.error('[kingOfTheHill] pending delete handler error', err);
    }
  }

  private async syncPendingProgress(): Promise<void> {
    try {
      const pending = await betRepository.listPendingBets('king_of_the_hill');
      for (const bet of pending) {
        const progress = await this.progressStore.get(bet.bet_id);
        if (!progress) {
          await this.initializeProgressForBet(bet);
        }
      }
    } catch (err) {
      console.error('[kingOfTheHill] progress sync error', err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc, updatedAt: string): Promise<void> {
    try {
      const bets = await betRepository.listPendingBets('king_of_the_hill', { gameId });
      for (const bet of bets) {
        if (this.initializingBets.has(bet.bet_id)) {
          this.logDebug('progress.defer', { betId: bet.bet_id, reason: 'initializing' });
          continue;
        }
        await this.evaluateBet(bet.bet_id, doc, updatedAt);
      }
    } catch (err) {
      console.error('[kingOfTheHill] process game update error', { gameId }, err);
    }
  }

  private async evaluateBet(betId: string, doc: RefinedGameDoc, updatedAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        console.warn('[kingOfTheHill] missing config; skipping bet', { betId });
        return;
      }
      const threshold = this.normalizeResolveValue(config);
      if (threshold == null) {
        await this.washBet(betId, { reason: 'invalid_threshold', config }, 'Invalid resolve value configuration.');
        return;
      }
      const progress =
        (await this.progressStore.get(betId)) ||
        (await this.initializeProgressForBet({ bet_id: betId, nfl_game_id: config.nfl_game_id }, doc, updatedAt));
      if (!progress) {
        console.warn('[kingOfTheHill] progress unavailable; skipping bet', { betId });
        return;
      }
      const progressMode = progress.progressMode || normalizeProgressMode(config.progress_mode);
      const player1Current = readPlayerStat(doc, { id: config.player1_id, name: config.player1_name }, progress.statKey);
      const player2Current = readPlayerStat(doc, { id: config.player2_id, name: config.player2_name }, progress.statKey);
      const timestamp = this.normalizeTimestamp(updatedAt, (doc as any)?.generatedAt);
      const updatedProgress = applyProgressUpdate(
        progress,
        progressMode,
        threshold,
        player1Current,
        player2Current,
        timestamp,
      );
      this.logDebug('progress.update', {
        betId,
        gameId: progress.gameId,
        progressMode,
        threshold,
        player1: this.describePlayer(updatedProgress.player1, player1Current, progressMode),
        player2: this.describePlayer(updatedProgress.player2, player2Current, progressMode),
      });
      await this.progressStore.set(betId, updatedProgress);
      const outcome = determineProgressOutcome(updatedProgress);
      if (outcome === 'player1') {
        this.logDebug('progress.outcome', { betId, outcome: 'player1', statKey: updatedProgress.statKey, threshold });
        await this.setWinner(betId, config.player1_name || updatedProgress.player1.name || 'Player 1', updatedProgress);
        await this.progressStore.delete(betId);
        return;
      }
      if (outcome === 'player2') {
        this.logDebug('progress.outcome', { betId, outcome: 'player2', statKey: updatedProgress.statKey, threshold });
        await this.setWinner(betId, config.player2_name || updatedProgress.player2.name || 'Player 2', updatedProgress);
        await this.progressStore.delete(betId);
        return;
      }
      if (outcome === 'tie') {
        await this.washBet(
          betId,
          {
            reason: 'simultaneous_finish',
            threshold: updatedProgress.threshold,
            player1: updatedProgress.player1,
            player2: updatedProgress.player2,
            stat_key: updatedProgress.statKey,
            progress_mode: updatedProgress.progressMode,
          },
          'Both players reached the resolve value at the same time.',
        );
        await this.progressStore.delete(betId);
        return;
      }
      const status = normalizeStatus(doc.status);
      if (status === 'STATUS_FINAL' && outcome === 'none') {
        await this.setNeitherResult(betId, updatedProgress);
        await this.progressStore.delete(betId);
      }
    } catch (err) {
      console.error('[kingOfTheHill] evaluate bet error', { betId }, err);
    }
  }

  private async initializeProgressForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
    eventTimestamp?: string,
  ): Promise<ProgressRecord | null> {
    const existing = await this.progressStore.get(bet.bet_id);
    if (existing) return existing;
    this.initializingBets.add(bet.bet_id);
    const config = await this.getConfigForBet(bet.bet_id);
    try {
      if (!config) {
        console.warn('[kingOfTheHill] cannot initialize progress; missing config', { betId: bet.bet_id });
        return null;
      }
      const statKey = resolveStatKey(config);
      if (!statKey) {
        console.warn('[kingOfTheHill] unsupported stat key', { betId: bet.bet_id, stat: config.stat });
        return null;
      }
      const progressMode = normalizeProgressMode(config.progress_mode);
      const threshold = this.normalizeResolveValue(config);
      if (threshold == null) {
        console.warn('[kingOfTheHill] invalid resolve value', { betId: bet.bet_id });
        return null;
      }
      const gameId = config.nfl_game_id || bet.nfl_game_id;
      if (!gameId) {
        console.warn('[kingOfTheHill] missing game id for progress capture', { betId: bet.bet_id });
        return null;
      }
      const doc = await ensureRefinedGameDoc(gameId, prefetchedDoc ?? null);
      if (!doc) {
        console.warn('[kingOfTheHill] refined doc unavailable for progress capture', { betId: bet.bet_id, gameId });
        return null;
      }
      const capturedAt = this.normalizeTimestamp(eventTimestamp, (doc as any)?.generatedAt);
      const progress = buildProgressRecord(doc, config, statKey, threshold, progressMode, gameId, capturedAt);
      const player1Value = progress.player1.lastValue;
      const player2Value = progress.player2.lastValue;
      this.logDebug('progress.baseline_capture', {
        betId: bet.bet_id,
        gameId,
        progressMode,
        statKey,
        threshold,
        player1_baseline: player1Value,
        player2_baseline: player2Value,
        capturedAt,
      });
      if (progressMode === 'cumulative' && (player1Value >= threshold || player2Value >= threshold)) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'threshold_met_before_pending',
            threshold,
            player1_value: player1Value,
            player2_value: player2Value,
            progress_mode: progressMode,
          },
          'Resolve value was already met before the bet became pending.',
        );
        return null;
      }
      await this.progressStore.set(bet.bet_id, progress);
      await betRepository.recordHistory(bet.bet_id, this.snapshotEvent, progress as unknown as Record<string, unknown>);
      return progress;
    } finally {
      this.initializingBets.delete(bet.bet_id);
    }
  }


  private async setWinner(betId: string, winningChoice: string, progress: ProgressRecord): Promise<void> {
    const updated = await betRepository.setWinningChoice(betId, winningChoice);
    if (!updated) return;
    await betRepository.recordHistory(betId, this.resultEvent, {
      outcome: winningChoice,
      threshold: progress.threshold,
      player1: progress.player1,
      player2: progress.player2,
      stat_key: progress.statKey,
      progress_mode: progress.progressMode,
      captured_at: new Date().toISOString(),
    });
  }

  private async setNeitherResult(betId: string, progress: ProgressRecord): Promise<void> {
    const updated = await betRepository.setWinningChoice(betId, 'Neither');
    if (!updated) return;
    await betRepository.recordHistory(betId, this.resultEvent, {
      outcome: 'Neither',
      threshold: progress.threshold,
      player1: progress.player1,
      player2: progress.player2,
      stat_key: progress.statKey,
      progress_mode: progress.progressMode,
      captured_at: new Date().toISOString(),
    });
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

  private normalizeResolveValue(config: KingOfTheHillConfig): number | null {
    if (typeof config.resolve_value === 'number' && Number.isFinite(config.resolve_value)) {
      return clampResolveValue(config.resolve_value);
    }
    if (typeof config.resolve_value_label === 'string' && config.resolve_value_label.trim().length) {
      const parsed = Number.parseInt(config.resolve_value_label, 10);
      if (Number.isFinite(parsed)) {
        return clampResolveValue(parsed);
      }
    }
    return clampResolveValue(KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE);
  }

  private normalizeTimestamp(eventTimestamp?: string, docTimestamp?: string): string {
    if (eventTimestamp && Number.isFinite(Date.parse(eventTimestamp))) {
      return new Date(eventTimestamp).toISOString();
    }
    if (docTimestamp && Number.isFinite(Date.parse(docTimestamp))) {
      return new Date(docTimestamp).toISOString();
    }
    return new Date().toISOString();
  }

  private async getConfigForBet(betId: string): Promise<KingOfTheHillConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'king_of_the_hill') return null;
      return record.data as KingOfTheHillConfig;
    } catch (err) {
      console.error('[kingOfTheHill] fetch config error', { betId }, err);
      return null;
    }
  }

  private logDebug(event: string, payload: Record<string, unknown>): void {
    if (!this.debugEnabled) return;
    console.log('[kingOfTheHill][' + event + ']', payload);
  }

  private describePlayer(
    progress: PlayerProgress,
    latestValue: number,
    progressMode: 'starting_now' | 'cumulative',
  ): Record<string, unknown> {
    const baseline = Number.isFinite(progress.baselineValue) ? progress.baselineValue : 0;
    const delta = Math.max(0, latestValue - baseline);
    const metric = progressMode === 'starting_now' ? delta : latestValue;
    return {
      id: progress.id ?? null,
      name: progress.name ?? null,
      baseline,
      latestValue,
      delta,
      metric,
      reached: progress.reached,
      reachedAt: progress.reachedAt,
    };
  }
}

export const kingOfTheHillValidator = new KingOfTheHillValidatorService();
