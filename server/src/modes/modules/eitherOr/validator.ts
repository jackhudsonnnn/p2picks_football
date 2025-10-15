import chokidar from 'chokidar';
import Redis from 'ioredis';
import * as path from 'path';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabase, BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { loadRefinedGame, RefinedGameDoc, REFINED_DIR, findPlayer } from '../../../helpers';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from './constants';

type PlayerRef = { id?: string | null; name?: string | null };

interface EitherOrConfig {
  player1_id?: string | null;
  player1_name?: string | null;
  player2_id?: string | null;
  player2_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  nfl_game_id?: string | null;
  resolve_at?: string | null;
}

interface PlayerSnapshot {
  id?: string | null;
  name?: string | null;
  value: number;
}

interface BaselineRecord {
  statKey: string;
  capturedAt: string;
  gameId: string;
  player1: PlayerSnapshot;
  player2: PlayerSnapshot;
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

export class EitherOrValidatorService {
  private watcher: chokidar.FSWatcher | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private redisClient: Redis | null = null;
  private redisInitAttempted = false;
  private readonly baselineTtlSeconds = 60 * 60 * 12;
  private readonly memoryBaselines = new Map<string, { baseline: BaselineRecord; expiresAt: number }>();
  private memoryBaselineWarned = false;

  start() {
    this.startPendingMonitor();
    this.syncPendingBaselines().catch((err: unknown) => console.error('[eitherOr] baseline sync error', err));
    this.startWatcher();
  }

  stop() {
    if (this.watcher) this.watcher.close().catch(() => {});
    this.watcher = null;
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) => console.error('[eitherOr] pending channel unsubscribe error', err));
      this.pendingChannel = null;
    }
    if (this.redisClient) {
      this.redisClient.quit().catch((err: unknown) => console.error('[eitherOr] redis quit error', err));
      this.redisClient = null;
      this.redisInitAttempted = false;
    }
    this.memoryBaselines.clear();
  }

  private startWatcher() {
    if (this.watcher) return;
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    console.log('[eitherOr] starting watcher on', dir);
    this.watcher = chokidar
      .watch(path.join(dir, '*.json'), { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 } })
      .on('add', (file) => this.onFileChanged(file))
      .on('change', (file) => this.onFileChanged(file))
      .on('error', (err: unknown) => console.error('[eitherOr] watcher error', err));
  }

  private startPendingMonitor() {
    if (this.pendingChannel) return;
    const supa = getSupabase();
    this.pendingChannel = supa
      .channel('either-or-pending')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.either_or' }, (payload) => {
        void this.handleBetProposalUpdate(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.either_or' }, (payload) => {
        void this.handleBetProposalDelete(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[eitherOr] pending monitor ready');
        }
      });
  }

  private async handleBetProposalUpdate(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const newRow = (payload.new || {}) as Partial<BetProposal> & { nfl_game_id?: string | null };
      const oldRow = (payload.old || {}) as Partial<BetProposal> & { nfl_game_id?: string | null };
      if (!newRow?.bet_id) return;
      if (newRow.bet_status === 'pending' && oldRow?.bet_status !== 'pending') {
        await this.captureBaselineForBet(newRow as BetProposal);
      }
      if (newRow.bet_status !== 'pending' && oldRow?.bet_status === 'pending') {
        await this.clearBaseline(newRow.bet_id);
      }
      if (newRow.winning_choice && !oldRow?.winning_choice) {
        await this.clearBaseline(newRow.bet_id);
      }
    } catch (err: unknown) {
      console.error('[eitherOr] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const oldRow = (payload.old || {}) as Partial<BetProposal>;
      if (oldRow?.bet_id) {
        await this.clearBaseline(oldRow.bet_id);
      }
    } catch (err: unknown) {
      console.error('[eitherOr] pending delete handler error', err);
    }
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const supa = getSupabase();
      const { data, error } = await supa
        .from('bet_proposals')
        .select('bet_id, nfl_game_id, bet_status')
        .eq('mode_key', 'either_or')
        .eq('bet_status', 'pending');
      if (error) throw error;
      for (const row of data || []) {
        const baseline = await this.getBaseline(row.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(row as BetProposal);
        }
      }
    } catch (err: unknown) {
      console.error('[eitherOr] sync pending baselines failed', err);
    }
  }

  private async onFileChanged(filePath: string) {
    const gameId = path.basename(filePath, '.json');
    try {
      const doc = await loadRefinedGame(gameId);
      if (!doc) return;
      const status = String(doc.status || '').toUpperCase();
      const halftimeResolveAt =
        EITHER_OR_ALLOWED_RESOLVE_AT.find((value) => value.toLowerCase() === 'halftime') ?? 'Halftime';
      if (status === 'STATUS_HALFTIME') {
        await this.processFinalGame(gameId, doc, halftimeResolveAt);
        return;
      }
      if (status === 'STATUS_FINAL') {
        await this.processFinalGame(gameId, doc, halftimeResolveAt);
        await this.processFinalGame(gameId, doc, EITHER_OR_DEFAULT_RESOLVE_AT);
        return;
      }
    } catch (err: unknown) {
      console.error('[eitherOr] onFileChanged error', { filePath }, err);
    }
  }

  private async processFinalGame(gameId: string, doc: RefinedGameDoc, resolveAt: string = EITHER_OR_DEFAULT_RESOLVE_AT) {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'either_or')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[eitherOr] list pending bets error', { gameId }, error);
      return;
    }
    for (const bet of (data as BetProposal[]) || []) {
      await this.resolveBet(bet, doc, resolveAt);
    }
  }

  private async resolveBet(bet: BetProposal, doc: RefinedGameDoc, resolveAt: string) {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[eitherOr] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const configResolveAt = String(config.resolve_at ?? EITHER_OR_DEFAULT_RESOLVE_AT).trim();
      if (configResolveAt.toLowerCase() !== resolveAt.trim().toLowerCase()) {
        return;
      }
      const baseline = (await this.getBaseline(bet.bet_id)) || (await this.captureBaselineForBet(bet, doc));
      if (!baseline) {
        console.warn('[eitherOr] baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const player1Final = this.getPlayerStatValue(doc, { id: config.player1_id, name: config.player1_name }, baseline.statKey);
      const player2Final = this.getPlayerStatValue(doc, { id: config.player2_id, name: config.player2_name }, baseline.statKey);
      const delta1 = player1Final - baseline.player1.value;
      const delta2 = player2Final - baseline.player2.value;
      if (Number.isNaN(delta1) || Number.isNaN(delta2)) {
        console.warn('[eitherOr] computed NaN delta; skipping bet', { bet_id: bet.bet_id, delta1, delta2 });
        return;
      }
      if (delta1 === delta2) {
        await this.washBet(bet.bet_id, {
          stat: baseline.statKey,
          player1: { ...baseline.player1, final: player1Final, delta: delta1 },
          player2: { ...baseline.player2, final: player2Final, delta: delta2 },
          captured_at: new Date().toISOString(),
        });
        await this.clearBaseline(bet.bet_id);
        return;
      }
      const winner = delta1 > delta2 ? (config.player1_name || baseline.player1.name || 'Player 1') : (config.player2_name || baseline.player2.name || 'Player 2');
      const supa = getSupabase();
      const { error: updErr } = await supa
        .from('bet_proposals')
        .update({ winning_choice: winner })
        .eq('bet_id', bet.bet_id)
        .is('winning_choice', null);
      if (updErr) {
        console.error('[eitherOr] failed to set winning_choice', { bet_id: bet.bet_id, winner }, updErr);
        return;
      }
      await this.recordHistory(bet.bet_id, 'either_or_result', {
        outcome: 'winner',
        winning_choice: winner,
        stat: baseline.statKey,
        player1: { ...baseline.player1, final: player1Final, delta: delta1 },
        player2: { ...baseline.player2, final: player2Final, delta: delta2 },
        captured_at: new Date().toISOString(),
      });
      await this.clearBaseline(bet.bet_id);
    } catch (err: unknown) {
      console.error('[eitherOr] resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async washBet(betId: string, payload: Record<string, unknown>): Promise<void> {
    const supa = getSupabase();
    const updates = {
      bet_status: 'washed' as const,
      winning_choice: null as string | null,
      resolution_time: new Date().toISOString(),
    };
    const { error } = await supa.from('bet_proposals').update(updates).eq('bet_id', betId).eq('bet_status', 'pending');
    if (error) {
      console.error('[eitherOr] failed to wash bet', { betId }, error);
      return;
    }
    await this.recordHistory(betId, 'either_or_result', { outcome: 'wash', ...payload });
  }

  private async captureBaselineForBet(bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null }, prefetchedDoc?: RefinedGameDoc | null): Promise<BaselineRecord | null> {
    const existing = await this.getBaseline(bet.bet_id);
    if (existing) return existing;
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      console.warn('[eitherOr] cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }
    const statKey = config.stat || '';
    if (!statKey) {
      console.warn('[eitherOr] config missing stat key', { bet_id: bet.bet_id });
      return null;
    }
    const spec = PLAYER_STAT_MAP[statKey];
    if (!spec) {
      console.warn('[eitherOr] unsupported stat key', { bet_id: bet.bet_id, statKey });
      return null;
    }
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      console.warn('[eitherOr] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    let doc = prefetchedDoc ?? null;
    if (!doc) {
      doc = await loadRefinedGame(gameId);
    }
    if (!doc) {
      console.warn('[eitherOr] refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const player1Value = this.getPlayerStatValue(doc, { id: config.player1_id, name: config.player1_name }, statKey);
    const player2Value = this.getPlayerStatValue(doc, { id: config.player2_id, name: config.player2_name }, statKey);
    const baseline: BaselineRecord = {
      statKey,
      capturedAt: new Date().toISOString(),
      gameId,
      player1: { id: config.player1_id, name: config.player1_name, value: player1Value },
      player2: { id: config.player2_id, name: config.player2_name, value: player2Value },
    };
    await this.setBaseline(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, 'either_or_baseline', baseline as unknown as Record<string, unknown>);
    return baseline;
  }

  private async getConfigForBet(betId: string): Promise<EitherOrConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'either_or') return null;
      return record.data as EitherOrConfig;
    } catch (err: unknown) {
      console.error('[eitherOr] fetch config error', { betId }, err);
      return null;
    }
  }

  private getPlayerStatValue(doc: RefinedGameDoc, ref: PlayerRef, statKey: string): number {
    const spec = PLAYER_STAT_MAP[statKey];
    if (!spec) return 0;
    const player = this.lookupPlayer(doc, ref);
    if (!player) return 0;
    const categories = (player as any).stats || {};
    const category = (categories as any)[spec.category];
    if (!category || typeof category !== 'object') return 0;
    return this.normalizeStatValue((category as Record<string, unknown>)[spec.field]);
  }

  private lookupPlayer(doc: RefinedGameDoc, ref: PlayerRef) {
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

  private baselineKey(betId: string): string {
    return `eitherOr:baseline:${betId}`;
  }

  private cleanupMemoryBaselines() {
    const now = Date.now();
    for (const [key, entry] of this.memoryBaselines) {
      if (entry.expiresAt <= now) {
        this.memoryBaselines.delete(key);
      }
    }
  }

  private async setBaseline(betId: string, baseline: BaselineRecord): Promise<void> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    const value = JSON.stringify(baseline);
    if (redis) {
      try {
        await redis.set(key, value, 'EX', this.baselineTtlSeconds);
        return;
      } catch (err: unknown) {
        console.error('[eitherOr] redis baseline set error', { betId }, err);
      }
    }
    this.cleanupMemoryBaselines();
    this.memoryBaselines.set(key, { baseline, expiresAt: Date.now() + this.baselineTtlSeconds * 1000 });
    if (!this.memoryBaselineWarned) {
      console.warn('[eitherOr] baseline fallback to in-memory storage; Redis disabled or unavailable');
      this.memoryBaselineWarned = true;
    }
  }

  private async getBaseline(betId: string): Promise<BaselineRecord | null> {
    const key = this.baselineKey(betId);
    const redis = this.getRedis();
    if (redis) {
      try {
        const raw = await redis.get(key);
        if (raw) return JSON.parse(raw) as BaselineRecord;
      } catch (err: unknown) {
        console.error('[eitherOr] redis baseline get error', { betId }, err);
      }
    }
    this.cleanupMemoryBaselines();
    const entry = this.memoryBaselines.get(key);
    return entry ? entry.baseline : null;
  }

  private async clearBaseline(betId: string): Promise<void> {
    const key = this.baselineKey(betId);
    const redis = this.getRedis();
    if (redis) {
      try {
        await redis.del(key);
      } catch (err: unknown) {
        console.error('[eitherOr] redis baseline clear error', { betId }, err);
      }
    }
    this.memoryBaselines.delete(key);
  }

  private async recordHistory(betId: string, eventType: 'either_or_baseline' | 'either_or_result', payload: Record<string, unknown>): Promise<void> {
    try {
      const supa = getSupabase();
      const { error } = await supa.from('resolution_history').insert([{ bet_id: betId, event_type: eventType, payload }]);
      if (error) {
        console.error(`[eitherOr] failed to record ${eventType}`, { betId }, error);
      }
    } catch (err: unknown) {
      console.error(`[eitherOr] history record error (${eventType})`, { betId }, err);
    }
  }

  private getRedis(): Redis | null {
    if (this.redisClient) return this.redisClient;
    if (this.redisInitAttempted) return this.redisClient;
    this.redisInitAttempted = true;
    const url = process.env.REDIS_URL;
    if (!url) {
      console.error('[eitherOr] redis url not configured; validator requires Redis for durability');
      return null;
    }
    try {
      const client = new Redis(url);
      client.on('error', (err: unknown) => console.error('[eitherOr] redis error', err));
      this.redisClient = client;
      console.log('[eitherOr] redis client initialized');
    } catch (err: unknown) {
      console.error('[eitherOr] failed to initialize redis client', err);
      this.redisClient = null;
    }
    return this.redisClient;
  }
}

export const eitherOrValidator = new EitherOrValidatorService();
