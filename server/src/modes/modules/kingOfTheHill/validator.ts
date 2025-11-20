import Redis from 'ioredis';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { BetProposal, getSupabaseAdmin } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { GameFeedEvent, getCachedGameDoc, subscribeToGameFeed } from '../../../services/gameFeedService';
import { findPlayer, loadRefinedGame, type RefinedGameDoc } from '../../../helpers';
import { KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE, clampResolveValue } from './constants';

interface KingOfTheHillConfig {
  player1_id?: string | null;
  player1_name?: string | null;
  player2_id?: string | null;
  player2_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  nfl_game_id?: string | null;
  resolve_value?: number | null;
  resolve_value_label?: string | null;
  progress_mode?: string | null;
}

interface PlayerProgress {
  id?: string | null;
  name?: string | null;
  baselineValue: number;
  lastValue: number;
  reached: boolean;
  reachedAt: string | null;
  valueAtReach: number | null;
  deltaAtReach: number | null;
  metricAtReach: number | null;
}

interface ProgressRecord {
  statKey: string;
  threshold: number;
  gameId: string;
  capturedAt: string;
  progressMode: 'starting_now' | 'cumulative';
  player1: PlayerProgress;
  player2: PlayerProgress;
}

const PLAYER_STAT_MAP: Record<string, { category: string; field: string }> = {
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

export class KingOfTheHillValidatorService {
  private unsubscribe: (() => void) | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private redisClient: Redis | null = null;
  private readonly progressTtlSeconds = 60 * 60 * 12;
  private readonly modeLabel = 'King Of The Hill';
  private lastSignatureByGame = new Map<string, string>();

  start(): void {
    this.getRedis();
    this.startPendingMonitor();
    this.syncPendingProgress().catch((err: unknown) => console.error('[kingOfTheHill] progress sync error', err));
    this.startFeedSubscription();
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) =>
        console.error('[kingOfTheHill] pending channel unsubscribe error', err),
      );
      this.pendingChannel = null;
    }
    if (this.redisClient) {
      this.redisClient.quit().catch((err: unknown) => console.error('[kingOfTheHill] redis quit error', err));
      this.redisClient = null;
    }
    this.lastSignatureByGame.clear();
  }

  private startFeedSubscription(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribeToGameFeed((event) => {
      void this.handleGameFeedEvent(event);
    });
  }

  private startPendingMonitor(): void {
    if (this.pendingChannel) return;
    const supa = getSupabaseAdmin();
    this.pendingChannel = supa
      .channel('king-of-the-hill-pending')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.king_of_the_hill' },
        (payload) => {
          void this.handleBetProposalUpdate(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.king_of_the_hill' },
        (payload) => {
          void this.handleBetProposalDelete(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[kingOfTheHill] pending monitor ready');
        }
      });
  }

  private async handleBetProposalUpdate(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const newRow = (payload.new || {}) as Partial<BetProposal> & { nfl_game_id?: string | null };
      const oldRow = (payload.old || {}) as Partial<BetProposal> & { nfl_game_id?: string | null };
      if (!newRow?.bet_id) return;
      if (newRow.bet_status === 'pending' && oldRow?.bet_status !== 'pending') {
        await this.initializeProgressForBet(newRow as BetProposal);
      }
      if (newRow.bet_status !== 'pending' && oldRow?.bet_status === 'pending') {
        await this.clearProgress(newRow.bet_id);
      }
      if (newRow.winning_choice && !oldRow?.winning_choice) {
        await this.clearProgress(newRow.bet_id);
      }
    } catch (err: unknown) {
      console.error('[kingOfTheHill] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const oldRow = (payload.old || {}) as Partial<BetProposal>;
      if (oldRow?.bet_id) {
        await this.clearProgress(oldRow.bet_id);
      }
    } catch (err: unknown) {
      console.error('[kingOfTheHill] pending delete handler error', err);
    }
  }

  private async syncPendingProgress(): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const { data, error } = await supa
        .from('bet_proposals')
        .select('bet_id, nfl_game_id, bet_status')
        .eq('mode_key', 'king_of_the_hill')
        .eq('bet_status', 'pending');
      if (error) throw error;
      for (const row of data || []) {
        const progress = await this.getProgress(row.bet_id);
        if (!progress) {
          await this.initializeProgressForBet(row as BetProposal);
        }
      }
    } catch (err: unknown) {
      console.error('[kingOfTheHill] sync pending progress failed', err);
    }
  }

  private async handleGameFeedEvent(event: GameFeedEvent): Promise<void> {
    try {
      const { gameId, doc, signature } = event;
      if (this.lastSignatureByGame.get(gameId) === signature) {
        return;
      }
      this.lastSignatureByGame.set(gameId, signature);
      await this.processGameUpdate(gameId, doc, event.updatedAt);
    } catch (err: unknown) {
      console.error('[kingOfTheHill] game feed event error', { gameId: event.gameId }, err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc, updatedAt: string): Promise<void> {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'king_of_the_hill')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[kingOfTheHill] list pending bets error', { gameId }, error);
      return;
    }
    for (const bet of (data as BetProposal[]) || []) {
      await this.evaluateBet(bet, doc, updatedAt);
    }
  }

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc, updatedAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[kingOfTheHill] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const threshold = this.normalizeResolveValue(config);
      if (threshold == null) {
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'invalid_threshold',
            captured_at: new Date().toISOString(),
            config,
          },
          'Invalid resolve value configuration.',
        );
        return;
      }
      const progress = (await this.getProgress(bet.bet_id)) || (await this.initializeProgressForBet(bet, doc, updatedAt));
      if (!progress) {
        console.warn('[kingOfTheHill] progress unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const progressMode = progress.progressMode || this.normalizeProgressMode(config.progress_mode);
      const player1Current = this.getPlayerStatValue(doc, { id: config.player1_id, name: config.player1_name }, progress.statKey);
      const player2Current = this.getPlayerStatValue(doc, { id: config.player2_id, name: config.player2_name }, progress.statKey);
      const timestamp = this.normalizeTimestamp(updatedAt, (doc as any)?.generatedAt);
      const player1Baseline = this.ensureBaselineValue(progress.player1, player1Current);
      const player2Baseline = this.ensureBaselineValue(progress.player2, player2Current);
      const player1Delta = this.computeDelta(player1Current, player1Baseline);
      const player2Delta = this.computeDelta(player2Current, player2Baseline);
      const player1Metric = progressMode === 'starting_now' ? player1Delta : player1Current;
      const player2Metric = progressMode === 'starting_now' ? player2Delta : player2Current;
      const player1Progress: PlayerProgress = {
        ...progress.player1,
        baselineValue: player1Baseline,
        lastValue: player1Current,
        metricAtReach: progress.player1.metricAtReach ?? null,
      };
      const player2Progress: PlayerProgress = {
        ...progress.player2,
        baselineValue: player2Baseline,
        lastValue: player2Current,
        metricAtReach: progress.player2.metricAtReach ?? null,
      };

      if (!player1Progress.reached && player1Metric >= threshold) {
        player1Progress.reached = true;
        player1Progress.reachedAt = timestamp;
        player1Progress.valueAtReach = player1Current;
        player1Progress.deltaAtReach = player1Delta;
        player1Progress.metricAtReach = player1Metric;
      }
      if (!player2Progress.reached && player2Metric >= threshold) {
        player2Progress.reached = true;
        player2Progress.reachedAt = timestamp;
        player2Progress.valueAtReach = player2Current;
        player2Progress.deltaAtReach = player2Delta;
        player2Progress.metricAtReach = player2Metric;
      }

      const updatedProgress: ProgressRecord = {
        ...progress,
        progressMode,
        player1: player1Progress,
        player2: player2Progress,
      };

      await this.setProgress(bet.bet_id, updatedProgress);

      if (updatedProgress.player1.reached && !updatedProgress.player2.reached) {
        await this.setWinner(bet.bet_id, config.player1_name || updatedProgress.player1.name || 'Player 1', {
          threshold,
          player1: updatedProgress.player1,
          player2: updatedProgress.player2,
          statKey: progress.statKey,
          progressMode,
        });
        await this.clearProgress(bet.bet_id);
        return;
      }
      if (updatedProgress.player2.reached && !updatedProgress.player1.reached) {
        await this.setWinner(bet.bet_id, config.player2_name || updatedProgress.player2.name || 'Player 2', {
          threshold,
          player1: updatedProgress.player1,
          player2: updatedProgress.player2,
          statKey: progress.statKey,
          progressMode,
        });
        await this.clearProgress(bet.bet_id);
        return;
      }
      if (updatedProgress.player1.reached && updatedProgress.player2.reached) {
        const outcome = this.resolveSimultaneousFinish(updatedProgress);
        if (outcome === 'player1') {
          await this.setWinner(bet.bet_id, config.player1_name || updatedProgress.player1.name || 'Player 1', {
            threshold,
            player1: updatedProgress.player1,
            player2: updatedProgress.player2,
            statKey: progress.statKey,
            progressMode,
          });
          await this.clearProgress(bet.bet_id);
          return;
        }
        if (outcome === 'player2') {
          await this.setWinner(bet.bet_id, config.player2_name || updatedProgress.player2.name || 'Player 2', {
            threshold,
            player1: updatedProgress.player1,
            player2: updatedProgress.player2,
            statKey: progress.statKey,
            progressMode,
          });
          await this.clearProgress(bet.bet_id);
          return;
        }
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'simultaneous_finish',
            threshold,
            player1: updatedProgress.player1,
            player2: updatedProgress.player2,
            statKey: progress.statKey,
            captured_at: new Date().toISOString(),
            progress_mode: progressMode,
          },
          'Both players reached the resolve value at the same time.',
        );
        await this.clearProgress(bet.bet_id);
        return;
      }

      const status = String(doc.status || '').toUpperCase();
      if (status === 'STATUS_FINAL') {
        if (!updatedProgress.player1.reached && !updatedProgress.player2.reached) {
          await this.setNeitherResult(bet.bet_id, {
            threshold,
            player1: updatedProgress.player1,
            player2: updatedProgress.player2,
            statKey: progress.statKey,
            progressMode,
          });
          await this.clearProgress(bet.bet_id);
        }
      }
    } catch (err: unknown) {
      console.error('[kingOfTheHill] evaluate bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private resolveSimultaneousFinish(progress: ProgressRecord): 'player1' | 'player2' | 'tie' {
    const player1 = progress.player1;
    const player2 = progress.player2;
    const mode = progress.progressMode || 'starting_now';
    if (player1.reachedAt && player2.reachedAt) {
      const ts1 = Date.parse(player1.reachedAt);
      const ts2 = Date.parse(player2.reachedAt);
      if (Number.isFinite(ts1) && Number.isFinite(ts2) && ts1 !== ts2) {
        return ts1 < ts2 ? 'player1' : 'player2';
      }
    }
    const metric1 = this.metricFromProgress(player1, mode);
    const metric2 = this.metricFromProgress(player2, mode);
    if (metric1 != null && metric2 != null && metric1 !== metric2) {
      return metric1 > metric2 ? 'player1' : 'player2';
    }
    if (player1.valueAtReach != null && player2.valueAtReach != null && player1.valueAtReach !== player2.valueAtReach) {
      return player1.valueAtReach > player2.valueAtReach ? 'player1' : 'player2';
    }
    return 'tie';
  }

  private async initializeProgressForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
    eventTimestamp?: string,
  ): Promise<ProgressRecord | null> {
    const existing = await this.getProgress(bet.bet_id);
    if (existing) return existing;
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      console.warn('[kingOfTheHill] cannot initialize progress; missing config', { bet_id: bet.bet_id });
      return null;
    }
    const statKey = config.stat || '';
    if (!statKey) {
      console.warn('[kingOfTheHill] config missing stat key', { bet_id: bet.bet_id });
      return null;
    }
    const progressMode = this.normalizeProgressMode(config.progress_mode);
    const threshold = this.normalizeResolveValue(config);
    if (threshold == null) {
      console.warn('[kingOfTheHill] config missing resolve value', { bet_id: bet.bet_id });
      return null;
    }
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      console.warn('[kingOfTheHill] missing game id for progress capture', { bet_id: bet.bet_id });
      return null;
    }
    let doc = prefetchedDoc ?? getCachedGameDoc(gameId) ?? null;
    if (!doc) {
      doc = await loadRefinedGame(gameId);
    }
    if (!doc) {
      console.warn('[kingOfTheHill] refined doc unavailable for progress capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const player1Value = this.getPlayerStatValue(doc, { id: config.player1_id, name: config.player1_name }, statKey);
    const player2Value = this.getPlayerStatValue(doc, { id: config.player2_id, name: config.player2_name }, statKey);

    if (progressMode === 'cumulative' && (player1Value >= threshold || player2Value >= threshold)) {
      await this.washBet(
        bet.bet_id,
        {
          outcome: 'wash',
          reason: 'threshold_met_before_pending',
          threshold,
          player1_value: player1Value,
          player2_value: player2Value,
          captured_at: new Date().toISOString(),
          progress_mode: progressMode,
        },
        'Resolve value was already met before the bet became pending.',
      );
      return null;
    }

    const capturedAt = this.normalizeTimestamp(eventTimestamp, (doc as any)?.generatedAt);
    const progress: ProgressRecord = {
      statKey,
      threshold,
      gameId,
      capturedAt,
      progressMode,
      player1: {
        id: config.player1_id,
        name: config.player1_name,
        baselineValue: player1Value,
        lastValue: player1Value,
        reached: false,
        reachedAt: null,
        valueAtReach: null,
        deltaAtReach: null,
        metricAtReach: null,
      },
      player2: {
        id: config.player2_id,
        name: config.player2_name,
        baselineValue: player2Value,
        lastValue: player2Value,
        reached: false,
        reachedAt: null,
        valueAtReach: null,
        deltaAtReach: null,
        metricAtReach: null,
      },
    };
    await this.setProgress(bet.bet_id, progress);
    await this.recordHistory(bet.bet_id, 'king_of_the_hill_snapshot', progress as unknown as Record<string, unknown>);
    return progress;
  }

  private getPlayerStatValue(doc: RefinedGameDoc, ref: { id?: string | null; name?: string | null }, statKey: string): number {
    const spec = PLAYER_STAT_MAP[statKey];
    if (!spec) return 0;
    const player = this.lookupPlayer(doc, ref);
    if (!player) return 0;
    const categories = (player as any).stats || {};
    const category = (categories as any)[spec.category];
    if (!category || typeof category !== 'object') return 0;
    return this.normalizeStatValue((category as Record<string, unknown>)[spec.field]);
  }

  private lookupPlayer(doc: RefinedGameDoc, ref: { id?: string | null; name?: string | null }) {
    if (ref.id) {
      const player = findPlayer(doc, String(ref.id));
      if (player) return player;
    }
    if (ref.name) {
      const player = findPlayer(doc, `name:${ref.name}`);
      if (player) return player;
    }
    return null;
  }

  private normalizeStatValue(raw: unknown): number {
    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) return raw;
      return 0;
    }
    if (typeof raw === 'string') {
      const first = raw.split('/')[0];
      const num = Number(first);
      return Number.isFinite(num) ? num : 0;
    }
    return 0;
  }

  private ensureBaselineValue(player: PlayerProgress | undefined, fallback: number): number {
    if (player && typeof player.baselineValue === 'number' && Number.isFinite(player.baselineValue)) {
      return player.baselineValue;
    }
    if (Number.isFinite(fallback)) {
      return fallback;
    }
    return 0;
  }

  private computeDelta(current: number, baseline: number): number {
    if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
      return 0;
    }
    return Math.max(0, current - baseline);
  }

  private deltaFromProgress(player: PlayerProgress): number | null {
    if (typeof player.deltaAtReach === 'number' && Number.isFinite(player.deltaAtReach)) {
      return player.deltaAtReach;
    }
    const baseline = Number.isFinite(player.baselineValue) ? player.baselineValue : 0;
    if (typeof player.valueAtReach === 'number' && Number.isFinite(player.valueAtReach)) {
      const delta = player.valueAtReach - baseline;
      if (Number.isFinite(delta)) {
        return delta;
      }
    }
    if (typeof player.lastValue === 'number' && Number.isFinite(player.lastValue)) {
      const delta = player.lastValue - baseline;
      if (Number.isFinite(delta)) {
        return Math.max(0, delta);
      }
    }
    return null;
  }

  private metricFromProgress(player: PlayerProgress, progressMode: 'starting_now' | 'cumulative'): number | null {
    if (typeof player.metricAtReach === 'number' && Number.isFinite(player.metricAtReach)) {
      return player.metricAtReach;
    }
    if (progressMode === 'starting_now') {
      return this.deltaFromProgress(player);
    }
    return this.valueFromProgress(player);
  }

  private valueFromProgress(player: PlayerProgress): number | null {
    if (typeof player.valueAtReach === 'number' && Number.isFinite(player.valueAtReach)) {
      return player.valueAtReach;
    }
    if (typeof player.lastValue === 'number' && Number.isFinite(player.lastValue)) {
      return player.lastValue;
    }
    return null;
  }

  private normalizeProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
    if (typeof mode === 'string' && mode.trim().toLowerCase() === 'cumulative') {
      return 'cumulative';
    }
    return 'starting_now';
  }

  private async setWinner(
    betId: string,
    winningChoice: string,
    payload: { threshold: number; player1: PlayerProgress; player2: PlayerProgress; statKey: string; progressMode: 'starting_now' | 'cumulative' },
  ): Promise<void> {
    const supa = getSupabaseAdmin();
    const { error: updErr } = await supa
      .from('bet_proposals')
      .update({ winning_choice: winningChoice })
      .eq('bet_id', betId)
      .is('winning_choice', null);
    if (updErr) {
      console.error('[kingOfTheHill] failed to set winning choice', { bet_id: betId, winningChoice }, updErr);
      return;
    }
    await this.recordHistory(betId, 'king_of_the_hill_result', {
      outcome: winningChoice,
      threshold: payload.threshold,
      player1: payload.player1,
      player2: payload.player2,
      stat_key: payload.statKey,
      progress_mode: payload.progressMode,
      captured_at: new Date().toISOString(),
    });
  }

  private async setNeitherResult(
    betId: string,
    payload: { threshold: number; player1: PlayerProgress; player2: PlayerProgress; statKey: string; progressMode: 'starting_now' | 'cumulative' },
  ): Promise<void> {
    const supa = getSupabaseAdmin();
    const { error: updErr } = await supa
      .from('bet_proposals')
      .update({ winning_choice: 'Neither' })
      .eq('bet_id', betId)
      .is('winning_choice', null);
    if (updErr) {
      console.error('[kingOfTheHill] failed to set Neither result', { bet_id: betId }, updErr);
      return;
    }
    await this.recordHistory(betId, 'king_of_the_hill_result', {
      outcome: 'Neither',
      threshold: payload.threshold,
      player1: payload.player1,
      player2: payload.player2,
      stat_key: payload.statKey,
      progress_mode: payload.progressMode,
      captured_at: new Date().toISOString(),
    });
  }

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    const supa = getSupabaseAdmin();
    const updates = {
      bet_status: 'washed' as const,
      winning_choice: null as string | null,
      resolution_time: new Date().toISOString(),
    };
    const { data, error } = await supa
      .from('bet_proposals')
      .update(updates)
      .eq('bet_id', betId)
      .eq('bet_status', 'pending')
      .select('bet_id, table_id')
      .maybeSingle();
    if (error) {
      console.error('[kingOfTheHill] failed to wash bet', { betId }, error);
      return;
    }
    if (!data) {
      console.warn('[kingOfTheHill] wash skipped; bet not pending', { betId });
      return;
    }
    await this.recordHistory(betId, 'king_of_the_hill_result', {
      ...payload,
      captured_at: new Date().toISOString(),
    });
    if (!data.table_id) {
      console.warn('[kingOfTheHill] wash message skipped; table_id missing', { betId });
      return;
    }
    await this.createWashSystemMessage(data.table_id, betId, explanation);
  }

  private async createWashSystemMessage(tableId: string, betId: string, explanation: string): Promise<void> {
    const supa = getSupabaseAdmin();
    const reason = explanation && explanation.trim().length ? explanation.trim() : 'See resolution history for details.';
    const message = `Bet #${this.formatBetLabel(betId)} washed\n\n${reason}`;
    try {
      const { error } = await supa.from('system_messages').insert([
        {
          table_id: tableId,
          message_text: message,
          generated_at: new Date().toISOString(),
        },
      ]);
      if (error) {
        console.error('[kingOfTheHill] failed to create wash system message', { betId, tableId }, error);
      }
    } catch (err: unknown) {
      console.error('[kingOfTheHill] wash system message error', { betId, tableId }, err);
    }
  }

  private formatBetLabel(betId: string): string {
    if (!betId) return 'UNKNOWN';
    const trimmed = betId.trim();
    if (!trimmed) return 'UNKNOWN';
    const short = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
    return short;
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
    return KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE;
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
    } catch (err: unknown) {
      console.error('[kingOfTheHill] fetch config error', { betId }, err);
      return null;
    }
  }

  private async recordHistory(betId: string, eventType: 'king_of_the_hill_result' | 'king_of_the_hill_snapshot', payload: Record<string, unknown>): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const { error } = await supa.from('resolution_history').insert([
        { bet_id: betId, event_type: eventType, payload },
      ]);
      if (error) {
        console.error('[kingOfTheHill] history record error', { betId, eventType }, error);
      }
    } catch (err: unknown) {
      console.error('[kingOfTheHill] history insert error', { betId, eventType }, err);
    }
  }

  private progressKey(betId: string): string {
    return `kingOfTheHill:progress:${betId}`;
  }

  private async setProgress(betId: string, progress: ProgressRecord): Promise<void> {
    const redis = this.getRedis();
    try {
      await redis.set(this.progressKey(betId), JSON.stringify(progress), 'EX', this.progressTtlSeconds);
    } catch (err: unknown) {
      console.error('[kingOfTheHill] redis progress set error', { betId }, err);
    }
  }

  private async getProgress(betId: string): Promise<ProgressRecord | null> {
    const redis = this.getRedis();
    try {
      const raw = await redis.get(this.progressKey(betId));
      if (!raw) return null;
      return JSON.parse(raw) as ProgressRecord;
    } catch (err: unknown) {
      console.error('[kingOfTheHill] redis progress get error', { betId }, err);
      return null;
    }
  }

  private async clearProgress(betId: string): Promise<void> {
    const redis = this.getRedis();
    try {
      await redis.del(this.progressKey(betId));
    } catch (err: unknown) {
      console.error('[kingOfTheHill] redis progress clear error', { betId }, err);
    }
  }

  private getRedis(): Redis {
    if (this.redisClient) return this.redisClient;
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(`[${this.modeLabel}] REDIS_URL not configured; Redis is required`);
    }
    try {
      const client = new Redis(url);
      client.on('error', (err: unknown) => console.error('[kingOfTheHill] redis error', err));
      this.redisClient = client;
      console.log('[kingOfTheHill] redis client initialized');
      return client;
    } catch (err: unknown) {
      throw new Error(`[kingOfTheHill] failed to initialize redis client: ${String(err)}`);
    }
  }
}

export const kingOfTheHillValidator = new KingOfTheHillValidatorService();
