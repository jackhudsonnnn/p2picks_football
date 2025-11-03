import Redis from 'ioredis';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabaseAdmin, BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { loadRefinedGame, RefinedGameDoc, findPlayer } from '../../../helpers';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from './constants';
import { GameFeedEvent, getCachedGameDoc, subscribeToGameFeed } from '../../../services/gameFeedService';

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
  passesDefended: { category: 'defensive', field: 'passesDefended' }
};

export class EitherOrValidatorService {
  private unsubscribe: (() => void) | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private redisClient: Redis | null = null;
  private readonly baselineTtlSeconds = 60 * 60 * 12;
  private readonly modeLabel = 'Either Or';
  private lastSignatureByGame = new Map<string, string>();

  start() {
    this.getRedis();
    this.startPendingMonitor();
    this.syncPendingBaselines().catch((err: unknown) => console.error('[eitherOr] baseline sync error', err));
    this.startFeedSubscription();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) => console.error('[eitherOr] pending channel unsubscribe error', err));
      this.pendingChannel = null;
    }
    if (this.redisClient) {
      this.redisClient.quit().catch((err: unknown) => console.error('[eitherOr] redis quit error', err));
      this.redisClient = null;
    }
    this.lastSignatureByGame.clear();
  }

  private startFeedSubscription() {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribeToGameFeed((event) => {
      void this.handleGameFeedEvent(event);
    });
  }

  private startPendingMonitor() {
    if (this.pendingChannel) return;
  const supa = getSupabaseAdmin();
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
  const supa = getSupabaseAdmin();
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

  private async handleGameFeedEvent(event: GameFeedEvent): Promise<void> {
    try {
      const { gameId, doc, signature } = event;
      if (this.lastSignatureByGame.get(gameId) === signature) {
        return;
      }
      this.lastSignatureByGame.set(gameId, signature);

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
      }
    } catch (err: unknown) {
      console.error('[eitherOr] game feed event error', { gameId: event.gameId }, err);
    }
  }

  private async processFinalGame(gameId: string, doc: RefinedGameDoc, resolveAt: string = EITHER_OR_DEFAULT_RESOLVE_AT) {
  const supa = getSupabaseAdmin();
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
        const player1Label = config.player1_name || baseline.player1.name || 'Player 1';
        const player2Label = config.player2_name || baseline.player2.name || 'Player 2';
        const statLabel = this.formatStatLabel(config, baseline.statKey);
        await this.washBet(
          bet.bet_id,
          {
            stat: baseline.statKey,
            player1: { ...baseline.player1, final: player1Final, delta: delta1 },
            player2: { ...baseline.player2, final: player2Final, delta: delta2 },
            captured_at: new Date().toISOString(),
          },
          `${player1Label} and ${player2Label} finished tied in ${statLabel}.`,
        );
        await this.clearBaseline(bet.bet_id);
        return;
      }
      const winner = delta1 > delta2 ? (config.player1_name || baseline.player1.name || 'Player 1') : (config.player2_name || baseline.player2.name || 'Player 2');
  const supa = getSupabaseAdmin();
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
      console.error('[eitherOr] failed to wash bet', { betId }, error);
      return;
    }
    if (!data) {
      console.warn('[eitherOr] wash skipped; bet not pending', { betId });
      return;
    }
    await this.recordHistory(betId, 'either_or_result', { outcome: 'wash', ...payload });
    if (!data.table_id) {
      console.warn('[eitherOr] wash message skipped; table_id missing', { betId });
      return;
    }
    await this.createWashSystemMessage(data.table_id, betId, explanation);
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
    let doc = prefetchedDoc ?? getCachedGameDoc(gameId) ?? null;
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

  private formatBetLabel(betId: string): string {
    if (!betId) return 'UNKNOWN';
    const trimmed = betId.trim();
    if (!trimmed) return 'UNKNOWN';
    const short = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
    return short;
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
        console.error('[eitherOr] failed to create wash system message', { betId, tableId }, error);
      }
    } catch (err: unknown) {
      console.error('[eitherOr] wash system message error', { betId, tableId }, err);
    }
  }

  private baselineKey(betId: string): string {
    return `eitherOr:baseline:${betId}`;
  }

  private async setBaseline(betId: string, baseline: BaselineRecord): Promise<void> {
    const key = this.baselineKey(betId);
    const value = JSON.stringify(baseline);
    const redis = this.getRedis();
    try {
      await redis.set(key, value, 'EX', this.baselineTtlSeconds);
    } catch (err: unknown) {
      console.error('[eitherOr] redis baseline set error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async getBaseline(betId: string): Promise<BaselineRecord | null> {
    const key = this.baselineKey(betId);
    const redis = this.getRedis();
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as BaselineRecord;
    } catch (err: unknown) {
      console.error('[eitherOr] redis baseline get error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    return null;
  }

  private async clearBaseline(betId: string): Promise<void> {
    const key = this.baselineKey(betId);
    const redis = this.getRedis();
    try {
      await redis.del(key);
    } catch (err: unknown) {
      console.error('[eitherOr] redis baseline clear error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async recordHistory(betId: string, eventType: 'either_or_baseline' | 'either_or_result', payload: Record<string, unknown>): Promise<void> {
    try {
  const supa = getSupabaseAdmin();
      const { error } = await supa.from('resolution_history').insert([{ bet_id: betId, event_type: eventType, payload }]);
      if (error) {
        console.error(`[eitherOr] failed to record ${eventType}`, { betId }, error);
      }
    } catch (err: unknown) {
      console.error(`[eitherOr] history record error (${eventType})`, { betId }, err);
    }
  }

  private getRedis(): Redis {
    if (this.redisClient) return this.redisClient;
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('[eitherOr] REDIS_URL not configured; Redis is required');
    }
    try {
      const client = new Redis(url);
      client.on('error', (err: unknown) => console.error('[eitherOr] redis error', err));
      this.redisClient = client;
      console.log('[eitherOr] redis client initialized');
      return client;
    } catch (err: unknown) {
      throw new Error(`[eitherOr] failed to initialize redis client: ${String(err)}`);
    }
  }
}

export const eitherOrValidator = new EitherOrValidatorService();
