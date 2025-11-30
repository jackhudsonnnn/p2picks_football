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
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from './constants';
import {
  buildEitherOrBaseline,
  evaluateEitherOr,
  EitherOrBaseline,
  EitherOrConfig,
} from './evaluator';

export class EitherOrValidatorService {
  private readonly kernel: ModeRuntimeKernel;
  private readonly baselineStore: RedisJsonStore<EitherOrBaseline>;
  private readonly resultEvent = 'either_or_result';
  private readonly baselineEvent = 'either_or_baseline';
  private readonly modeLabel = 'Either Or';

  constructor() {
    const redis = getRedisClient();
    this.baselineStore = new RedisJsonStore(redis, 'eitherOr:baseline', 60 * 60 * 12);
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'either_or',
      channelName: 'either-or-pending',
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
      const previous = (payload.old || {}) as Partial<BetProposal>;
      if (!next.bet_id) return;
      if (next.bet_status === 'pending' && previous.bet_status !== 'pending') {
        await this.captureBaselineForBet(next as BetProposal);
      }
      const exitedPending = next.bet_status !== 'pending' && previous.bet_status === 'pending';
      if (exitedPending || (next.winning_choice && !previous.winning_choice)) {
        await this.baselineStore.delete(next.bet_id);
      }
    } catch (err) {
      console.error('[eitherOr] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const previous = (payload.old || {}) as Partial<BetProposal>;
      if (previous.bet_id) {
        await this.baselineStore.delete(previous.bet_id);
      }
    } catch (err) {
      console.error('[eitherOr] pending delete handler error', err);
    }
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const pending = await betRepository.listPendingBets('either_or');
      for (const bet of pending) {
        const baseline = await this.baselineStore.get(bet.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(bet);
        }
      }
    } catch (err) {
      console.error('[eitherOr] baseline sync error', err);
    }
  }

  private async handleGameFeedEvent(gameId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const status = normalizeStatus(doc.status);
      const halftimeResolveAt =
        EITHER_OR_ALLOWED_RESOLVE_AT.find((value) => value.toLowerCase() === 'halftime') ?? 'Halftime';
      if (status === 'STATUS_HALFTIME') {
        await this.processFinalGame(gameId, doc, halftimeResolveAt);
        return;
      }
      if (status === 'STATUS_FINAL') {
        await this.processFinalGame(gameId, doc, halftimeResolveAt);
        await this.processFinalGame(gameId, doc, EITHER_OR_DEFAULT_RESOLVE_AT);
      }
    } catch (err) {
      console.error('[eitherOr] game feed event error', { gameId }, err);
    }
  }

  private async processFinalGame(gameId: string, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
    try {
      const bets = await betRepository.listPendingBets('either_or', { gameId });
      for (const bet of bets) {
        await this.resolveBet(bet.bet_id, doc, resolveAt);
      }
    } catch (err) {
      console.error('[eitherOr] process final game error', { gameId }, err);
    }
  }

  private async resolveBet(betId: string, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        console.warn('[eitherOr] missing config; skipping bet', { betId });
        return;
      }
      const configResolveAt = String(config.resolve_at ?? EITHER_OR_DEFAULT_RESOLVE_AT).trim().toLowerCase();
      if (configResolveAt !== resolveAt.trim().toLowerCase()) {
        return;
      }
      const progressMode = normalizeProgressMode(config.progress_mode);
      const baseline =
        (await this.baselineStore.get(betId)) ||
        (progressMode === 'starting_now'
          ? await this.captureBaselineForBet({ bet_id: betId, nfl_game_id: config.nfl_game_id })
          : null);
      if (progressMode === 'starting_now' && !baseline) {
        console.warn('[eitherOr] missing baseline for Starting Now', { betId });
        return;
      }
      const evaluation = evaluateEitherOr(doc, config, progressMode, baseline ?? undefined);
      if (!evaluation) {
        console.warn('[eitherOr] evaluation unavailable', { betId });
        return;
      }
      if (evaluation.outcome === 'tie') {
        await this.washBet(
          betId,
          {
            stat: evaluation.statKey,
            player1: {
              ...evaluation.player1.ref,
              baseline: evaluation.player1.baseline,
              final: evaluation.player1.final,
              delta: evaluation.player1.metric,
            },
            player2: {
              ...evaluation.player2.ref,
              baseline: evaluation.player2.baseline,
              final: evaluation.player2.final,
              delta: evaluation.player2.metric,
            },
            progress_mode: progressMode,
          },
          this.tieExplanation(config, evaluation.player1.ref.name, evaluation.player2.ref.name, evaluation.statKey),
        );
        await this.baselineStore.delete(betId);
        return;
      }
      const winnerName = evaluation.outcome === 'player1'
        ? config.player1_name || evaluation.player1.ref.name || 'Player 1'
        : config.player2_name || evaluation.player2.ref.name || 'Player 2';
      const updated = await betRepository.setWinningChoice(betId, winnerName);
      if (!updated) return;
      await betRepository.recordHistory(betId, this.resultEvent, {
        outcome: 'winner',
        winning_choice: winnerName,
        stat: evaluation.statKey,
        player1: {
          ...evaluation.player1.ref,
          baseline: evaluation.player1.baseline,
          final: evaluation.player1.final,
          delta: evaluation.player1.metric,
        },
        player2: {
          ...evaluation.player2.ref,
          baseline: evaluation.player2.baseline,
          final: evaluation.player2.final,
          delta: evaluation.player2.metric,
        },
        progress_mode: progressMode,
        captured_at: new Date().toISOString(),
      });
      await this.baselineStore.delete(betId);
    } catch (err) {
      console.error('[eitherOr] resolve bet error', { betId }, err);
    }
  }

  private tieExplanation(config: EitherOrConfig, player1Name?: string | null, player2Name?: string | null, statKey?: string | null): string {
    const p1 = player1Name || config.player1_name || 'Player 1';
    const p2 = player2Name || config.player2_name || 'Player 2';
    const statLabel = this.formatStatLabel(config, statKey || config.stat || '');
    return `${p1} and ${p2} finished tied in ${statLabel}.`;
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
  ): Promise<EitherOrBaseline | null> {
    const existing = await this.baselineStore.get(bet.bet_id);
    if (existing) return existing;
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      console.warn('[eitherOr] cannot capture baseline; missing config', { betId: bet.bet_id });
      return null;
    }
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      console.warn('[eitherOr] missing game id for baseline capture', { betId: bet.bet_id });
      return null;
    }
    const doc = await ensureRefinedGameDoc(gameId, prefetchedDoc ?? null);
    if (!doc) {
      console.warn('[eitherOr] refined doc unavailable for baseline capture', { betId: bet.bet_id, gameId });
      return null;
    }
    const baseline = buildEitherOrBaseline(doc, config, gameId);
    if (!baseline) {
      console.warn('[eitherOr] failed to build baseline; unsupported config', { betId: bet.bet_id });
      return null;
    }
    await this.baselineStore.set(bet.bet_id, baseline);
    await betRepository.recordHistory(bet.bet_id, this.baselineEvent, {
      stat: baseline.statKey,
      captured_at: baseline.capturedAt,
      player1: baseline.player1,
      player2: baseline.player2,
    });
    return baseline;
  }

  private async getConfigForBet(betId: string): Promise<EitherOrConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'either_or') return null;
      return record.data as EitherOrConfig;
    } catch (err) {
      console.error('[eitherOr] fetch config error', { betId }, err);
      return null;
    }
  }

  private formatStatLabel(config: EitherOrConfig, statKey: string): string {
    const raw = String(config.stat_label || config.stat || statKey || '').trim();
    if (!raw) return 'the selected stat';
    const withSpaces = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!withSpaces) return 'the selected stat';
    return withSpaces
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    await washBetWithHistory({
      betId,
      payload: { outcome: 'wash', ...payload },
      explanation,
      eventType: this.resultEvent,
      modeLabel: this.modeLabel,
    });
  }
}

export const eitherOrValidator = new EitherOrValidatorService();
