/**
 * BaseValidatorService - Abstract base class for mode validators.
 * 
 * Provides common infrastructure for:
 * - ModeRuntimeKernel lifecycle management
 * - Redis store management for baselines/progress
 * - Bet proposal update/delete handlers
 * - Config fetching
 * - Wash bet handling
 * - History recording
 */

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { BetProposal } from '../../supabaseClient';
import { fetchModeConfig } from '../../utils/modeConfig';
import { RefinedGameDoc } from '../../services/nflData/nflRefinedDataAccessors';
import { ModeRuntimeKernel, type KernelOptions } from './modeRuntimeKernel';
import { betRepository } from './betRepository';
import { washBetWithHistory } from './washService';
import { RedisJsonStore } from './redisJsonStore';
import { getRedisClient } from './redisClient';
import type { GameFeedEvent } from '../../services/nflData/nflGameFeedService';
import { enqueueSetWinningChoice, enqueueWashBet } from './resolutionQueue';
import { USE_RESOLUTION_QUEUE } from '../../constants/environment';

export interface BaseValidatorConfig {
  /** Unique mode key (e.g., 'either_or', 'king_of_the_hill') */
  modeKey: string;
  /** Realtime channel name for pending bets */
  channelName: string;
  /** Redis key prefix for storing baseline/progress data */
  storeKeyPrefix: string;
  /** Human-readable mode label for wash explanations */
  modeLabel: string;
  /** Event type for result history entries */
  resultEvent: string;
  /** Event type for baseline/snapshot history entries */
  baselineEvent: string;
  /** Redis TTL in seconds (default: 12 hours) */
  storeTtlSeconds?: number;
  /** Whether to dedupe game feed events */
  dedupeGameFeed?: boolean;
  /** Enable debug logging via environment variable check */
  debugEnvVar?: string;
  /** Use queue for resolution operations (default: true in production) */
  useResolutionQueue?: boolean;
}

export abstract class BaseValidatorService<TConfig, TStore> {
  protected readonly kernel: ModeRuntimeKernel;
  protected readonly store: RedisJsonStore<TStore>;
  protected readonly config: BaseValidatorConfig;
  protected readonly debugEnabled: boolean;
  protected readonly useQueue: boolean;

  constructor(config: BaseValidatorConfig) {
    this.config = config;
    this.debugEnabled = config.debugEnvVar
      ? process.env[config.debugEnvVar] === '1' || process.env[config.debugEnvVar] === 'true'
      : false;
    // Default to using queue unless explicitly disabled
    this.useQueue = config.useResolutionQueue ?? (USE_RESOLUTION_QUEUE !== '0');

    const redis = getRedisClient();
    this.store = new RedisJsonStore<TStore>(
      redis,
      config.storeKeyPrefix,
      config.storeTtlSeconds ?? 60 * 60 * 12
    );

    const kernelConfig: KernelOptions = {
      modeKey: config.modeKey,
      channelName: config.channelName,
      dedupeGameFeed: config.dedupeGameFeed ?? true,
      onPendingUpdate: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => 
        this.handleBetProposalUpdate(payload),
      onPendingDelete: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => 
        this.handleBetProposalDelete(payload),
      onGameEvent: (event: GameFeedEvent) => 
        this.handleGameEvent(event.gameId, event.doc, event.updatedAt),
      onReady: () => this.onKernelReady(),
    };

    this.kernel = new ModeRuntimeKernel(kernelConfig);
  }

  /**
   * Start the validator service.
   */
  start(): void {
    this.kernel.start();
  }

  /**
   * Stop the validator service.
   */
  stop(): void {
    this.kernel.stop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Abstract Methods - Must be implemented by subclasses
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Called when a bet transitions to pending status.
   * Subclasses should capture baselines, validate configuration, etc.
   */
  protected abstract onBetBecamePending(bet: BetProposal): Promise<void>;

  /**
   * Called when a game update is received.
   * Subclasses should evaluate pending bets and potentially resolve them.
   */
  protected abstract onGameUpdate(gameId: string, doc: RefinedGameDoc, updatedAt?: string): Promise<void>;

  /**
   * Called when the kernel is ready (all subscriptions established).
   * Subclasses should sync any missing baselines/progress for pending bets.
   */
  protected abstract onKernelReady(): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected Utility Methods - Available to subclasses
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch mode-specific configuration for a bet.
   */
  protected async getConfigForBet(betId: string): Promise<TConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== this.config.modeKey) return null;
      return record.data as TConfig;
    } catch (err) {
      console.error(`[${this.config.modeKey}] fetch config error`, { betId }, err);
      return null;
    }
  }

  /**
   * List all pending bets for this mode.
   */
  protected async listPendingBets(options?: { gameId?: string }): Promise<BetProposal[]> {
    return betRepository.listPendingBets(this.config.modeKey, options);
  }

  /**
   * Set the winning choice for a bet (direct DB call, no queue).
   */
  protected async setWinningChoice(betId: string, winningChoice: string): Promise<boolean> {
    return betRepository.setWinningChoice(betId, winningChoice);
  }

  /**
   * Resolve a bet with a winning choice.
   * If queue is enabled, this enqueues the resolution and returns true immediately.
   * The history is recorded as part of the queued job.
   * Store cleanup is done immediately since the bet is considered resolved.
   */
  protected async resolveWithWinner(
    betId: string,
    winningChoice: string,
    history: { eventType: string; payload: Record<string, unknown> },
  ): Promise<boolean> {
    if (this.useQueue) {
      await enqueueSetWinningChoice(betId, winningChoice, history);
      await this.store.delete(betId);
      this.logDebug('resolution_queued', { betId, winningChoice });
      return true; // Assume success; failures will be retried by queue
    }
    
    // Direct execution (non-queued)
    const updated = await betRepository.setWinningChoice(betId, winningChoice);
    if (updated) {
      await betRepository.recordHistory(betId, history.eventType, history.payload);
      await this.store.delete(betId);
    }
    return updated;
  }

  /**
   * Record a history entry for a bet.
   */
  protected async recordHistory(
    betId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await betRepository.recordHistory(betId, eventType, payload);
  }

  /**
   * Wash a bet (mark as no action) with explanation and history.
   * If queue is enabled, this enqueues the wash operation.
   */
  protected async washBet(
    betId: string,
    payload: Record<string, unknown>,
    explanation: string
  ): Promise<void> {
    const washPayload = { outcome: 'wash', ...payload };
    
    if (this.useQueue) {
      await enqueueWashBet({
        betId,
        payload: washPayload,
        explanation,
        eventType: this.config.resultEvent,
        modeLabel: this.config.modeLabel,
      });
      await this.store.delete(betId);
      this.logDebug('wash_queued', { betId });
      return;
    }
    
    // Direct execution (non-queued)
    await washBetWithHistory({
      betId,
      payload: washPayload,
      explanation,
      eventType: this.config.resultEvent,
      modeLabel: this.config.modeLabel,
    });
    await this.store.delete(betId);
  }

  /**
   * Log a debug message (only if debug is enabled for this mode).
   */
  protected logDebug(event: string, payload: Record<string, unknown>): void {
    if (!this.debugEnabled) return;
    console.log(`[${this.config.modeKey}][${event}]`, payload);
  }

  /**
   * Log a warning message.
   */
  protected logWarn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.warn(`[${this.config.modeKey}] ${message}`, context);
    } else {
      console.warn(`[${this.config.modeKey}] ${message}`);
    }
  }

  /**
   * Log an error message.
   */
  protected logError(message: string, context?: Record<string, unknown>, error?: unknown): void {
    if (error) {
      console.error(`[${this.config.modeKey}] ${message}`, context ?? {}, error);
    } else if (context) {
      console.error(`[${this.config.modeKey}] ${message}`, context);
    } else {
      console.error(`[${this.config.modeKey}] ${message}`);
    }
  }

  /**
   * Normalize a timestamp to ISO format.
   */
  protected normalizeTimestamp(eventTimestamp?: string, docTimestamp?: string): string {
    if (eventTimestamp && Number.isFinite(Date.parse(eventTimestamp))) {
      return new Date(eventTimestamp).toISOString();
    }
    if (docTimestamp && Number.isFinite(Date.parse(docTimestamp))) {
      return new Date(docTimestamp).toISOString();
    }
    return new Date().toISOString();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Internal implementation
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleBetProposalUpdate(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): Promise<void> {
    try {
      const next = (payload.new || {}) as Partial<BetProposal>;
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (!next.bet_id) return;

      // Bet just became pending
      if (next.bet_status === 'pending' && prev.bet_status !== 'pending') {
        await this.onBetBecamePending(next as BetProposal);
      }

      // Bet exited pending status or got a winning choice
      const exitedPending = next.bet_status !== 'pending' && prev.bet_status === 'pending';
      if (exitedPending || (next.winning_choice && !prev.winning_choice)) {
        await this.store.delete(next.bet_id);
      }
    } catch (err) {
      this.logError('pending update handler error', undefined, err);
    }
  }

  private async handleBetProposalDelete(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): Promise<void> {
    try {
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (prev.bet_id) {
        await this.store.delete(prev.bet_id);
      }
    } catch (err) {
      this.logError('pending delete handler error', undefined, err);
    }
  }

  private async handleGameEvent(
    gameId: string,
    doc: RefinedGameDoc,
    updatedAt?: string
  ): Promise<void> {
    try {
      await this.onGameUpdate(gameId, doc, updatedAt);
    } catch (err) {
      this.logError('game event handler error', { gameId }, err);
    }
  }
}
