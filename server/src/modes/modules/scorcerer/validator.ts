import { getSupabase, BetProposal } from '../../../supabaseClient';
import { getTeamScoreStats } from '../../../services/gameDataService';
import { loadRefinedGame, RefinedGameDoc } from '../../../helpers';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { GameFeedEvent, getCachedGameDoc, subscribeToGameFeed } from '../../../services/gameFeedService';

function pickWinningChoice(delta: { td: number; fg: number; sfty: number }): 'TD' | 'FG' | 'Safety' | null {
  if (delta.td > 0) return 'TD';
  if (delta.fg > 0) return 'FG';
  if (delta.sfty > 0) return 'Safety';
  return null;
}

interface AggregateTotals {
  touchdowns: number;
  fieldGoals: number;
  safeties: number;
  teamCount: number;
}

interface SnapshotRecord {
  shouldProcess: boolean;
  previousHash: string | null;
}

interface BaselineSnapshot {
  touchdowns: number;
  fieldGoals: number;
  safeties: number;
  capturedAt: string;
  gameId: string;
}

export class ScorcererValidatorService {
  private unsubscribe: (() => void) | null = null;
  private redisClient: Redis | null = null;
  private readonly redisSnapshotTtlSeconds = 60 * 60 * 6;
  private readonly storeRawSnapshots = process.env.SCORCERER_STORE_RAW === '1' || process.env.SCORCERER_STORE_RAW === 'true';
  private pendingChannel: RealtimeChannel | null = null;
  private readonly baselineTtlSeconds = 60 * 60 * 12;
  private lastSignatureByGame = new Map<string, string>();

  start() {
    this.getRedis();
    this.startPendingMonitor();
    this.syncPendingBaselines().catch((err: unknown) => console.error('[scorcerer] baseline sync error', err));
    this.startFeedSubscription();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) => console.error('[scorcerer] pending channel unsubscribe error', err));
      this.pendingChannel = null;
    }
    if (this.redisClient) {
      this.redisClient.quit().catch((err: unknown) => console.error('[scorcerer] redis quit error', err));
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
    const supa = getSupabase();
    const channel = supa
      .channel('scorcerer-pending')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.scorcerer' }, (payload) => {
        void this.handleBetProposalUpdate(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.scorcerer' }, (payload) => {
        void this.handleBetProposalDelete(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[scorcerer] pending monitor ready');
        }
      });
    this.pendingChannel = channel;
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const supa = getSupabase();
      const { data, error } = await supa
        .from('bet_proposals')
        .select('bet_id, nfl_game_id, bet_status, winning_choice')
        .eq('mode_key', 'scorcerer')
        .eq('bet_status', 'pending');
      if (error) throw error;
      for (const row of data || []) {
        const baseline = await this.getBaseline(row.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(row as BetProposal);
        }
      }
    } catch (err: unknown) {
      console.error('[scorcerer] sync pending baselines failed', err);
    }
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
      console.error('[scorcerer] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const oldRow = (payload.old || {}) as Partial<BetProposal>;
      if (oldRow?.bet_id) {
        await this.clearBaseline(oldRow.bet_id);
      }
    } catch (err: unknown) {
      console.error('[scorcerer] pending delete handler error', err);
    }
  }

  private baselineKey(betId: string): string {
    return `scorcerer:baseline:${betId}`;
  }

  private async setBaseline(betId: string, baseline: BaselineSnapshot): Promise<void> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    const value = JSON.stringify(baseline);
    try {
      await redis.set(key, value, 'EX', this.baselineTtlSeconds);
    } catch (err: unknown) {
      console.error('[scorcerer] redis baseline set error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async getBaseline(betId: string): Promise<BaselineSnapshot | null> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as BaselineSnapshot;
    } catch (err: unknown) {
      console.error('[scorcerer] redis baseline get error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    return null;
  }

  private async clearBaseline(betId: string): Promise<void> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    try {
      await redis.del(key);
    } catch (err: unknown) {
      console.error('[scorcerer] redis baseline clear error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async handleGameFeedEvent(event: GameFeedEvent): Promise<void> {
    try {
      const { gameId, doc, signature } = event;
      if (this.lastSignatureByGame.get(gameId) === signature) {
        return;
      }
      this.lastSignatureByGame.set(gameId, signature);
      await this.processGameUpdate(gameId, doc);
    } catch (err: unknown) {
      console.error('[scorcerer] game feed event error', { gameId: event.gameId }, err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc) {
    const isFinal = this.isFinalStatus(doc);
    const snapshot = await this.captureSnapshot(gameId, doc);
    if (!snapshot.shouldProcess && !isFinal) {
      return;
    }
    const supa = getSupabase();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'scorcerer')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[scorcerer] list pending bets error', { gameId }, error);
      return;
    }
    const bets = (data as BetProposal[]) || [];
    for (const bet of bets) {
      await this.evaluateBet(bet, doc, snapshot, isFinal);
    }
  }

  private async captureSnapshot(gameId: string, doc: RefinedGameDoc): Promise<SnapshotRecord> {
    const totals = await this.collectTotals(doc, gameId);
    const signatureJson = JSON.stringify(totals);
    const signatureHash = createHash('sha256').update(signatureJson).digest('hex');
    const cacheKey = this.snapshotKey(gameId);

    const redis = this.getRedis();
    try {
      const raw = await redis.get(cacheKey);
      let previousHash: string | null = null;
      if (raw) {
        const parsed = JSON.parse(raw) as { signatureHash: string; signatureJson?: string };
        previousHash = parsed.signatureHash ?? null;
        if (parsed.signatureHash === signatureHash) {
          return { shouldProcess: false, previousHash };
        }
      }
      const payload = {
        signatureHash,
        signatureJson: this.storeRawSnapshots ? signatureJson : undefined,
      };
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', this.redisSnapshotTtlSeconds);
      return { shouldProcess: true, previousHash };
    } catch (err: unknown) {
      console.error('[scorcerer] redis snapshot error', { gameId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async collectTotals(doc: RefinedGameDoc, gameId: string): Promise<AggregateTotals> {
    const totals: AggregateTotals = { touchdowns: 0, fieldGoals: 0, safeties: 0, teamCount: 0 };
    const teams = Array.isArray(doc.teams) ? (doc.teams as any[]) : [];
    totals.teamCount = teams.length;
    for (const team of teams) {
      const scoring = ((team || {}) as any).stats?.scoring || {};
      totals.touchdowns += this.normalizeNumber(scoring.touchdowns);
      totals.fieldGoals += this.normalizeNumber(scoring.fieldGoals);
      totals.safeties += this.normalizeNumber(scoring.safeties);
    }
    if (teams.length === 0) {
      const supaTotals = await getTeamScoreStats(gameId, 'aggregate');
      totals.touchdowns += this.normalizeNumber((supaTotals as any)?.touchdowns);
      totals.fieldGoals += this.normalizeNumber((supaTotals as any)?.fieldGoals);
      totals.safeties += this.normalizeNumber((supaTotals as any)?.safeties);
    }
    return totals;
  }

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc, snapshot: SnapshotRecord, isFinal: boolean) {
    try {
      const baseline = (await this.getBaseline(bet.bet_id)) || (await this.captureBaselineForBet(bet, doc));
      if (!baseline) {
        console.warn('[scorcerer] baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const totals = await this.collectTotals(doc, bet.nfl_game_id || '');
      const delta = {
        td: totals.touchdowns - baseline.touchdowns,
        fg: totals.fieldGoals - baseline.fieldGoals,
        sfty: totals.safeties - baseline.safeties,
      };
      const choice = pickWinningChoice(delta);
      if (!choice) {
        if (isFinal) {
          await this.settleNoMoreScores(bet, totals, baseline, delta, snapshot);
        }
        return;
      }
      const supa = getSupabase();
      const { error: updErr } = await supa
        .from('bet_proposals')
        .update({ winning_choice: choice })
        .eq('bet_id', bet.bet_id)
        .is('winning_choice', null);
      if (updErr) {
        console.error('[scorcerer] failed to set winning_choice', { bet_id: bet.bet_id, choice }, updErr);
        return;
      }
      await this.recordHistory(bet.bet_id, 'scorcerer_result', {
        outcome: choice,
        totals,
        baseline,
        delta,
        captured_at: new Date().toISOString(),
        snapshot_hash: snapshot.previousHash,
      });
      await this.clearBaseline(bet.bet_id);
    } catch (err: unknown) {
      console.error('[scorcerer] evaluate bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async settleNoMoreScores(
    bet: BetProposal,
    totals: AggregateTotals,
    baseline: BaselineSnapshot,
    delta: { td: number; fg: number; sfty: number },
    snapshot: SnapshotRecord,
  ) {
    try {
      const supa = getSupabase();
      const { error: updErr } = await supa
        .from('bet_proposals')
        .update({ winning_choice: 'No More Scores' })
        .eq('bet_id', bet.bet_id)
        .is('winning_choice', null);
      if (updErr) {
        console.error('[scorcerer] failed to set no-more-scores outcome', { bet_id: bet.bet_id }, updErr);
        return;
      }
      await this.recordHistory(bet.bet_id, 'scorcerer_result', {
        outcome: 'No More Scores',
        totals,
        baseline,
        delta,
        captured_at: new Date().toISOString(),
        snapshot_hash: snapshot.previousHash,
        reason: 'game_final_no_more_scores',
      });
      await this.clearBaseline(bet.bet_id);
    } catch (err: unknown) {
      console.error('[scorcerer] settle no-more-scores error', { bet_id: bet.bet_id }, err);
    }
  }

  private async captureBaselineForBet(bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null }, prefetchedDoc?: RefinedGameDoc | null): Promise<BaselineSnapshot | null> {
    const existing = await this.getBaseline(bet.bet_id);
    if (existing) return existing;
    const gameId = bet.nfl_game_id || null;
    if (!gameId) {
      console.warn('[scorcerer] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    let doc = prefetchedDoc ?? getCachedGameDoc(gameId) ?? null;
    if (!doc) {
      doc = await loadRefinedGame(gameId);
    }
    if (!doc) {
      console.warn('[scorcerer] refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const totals = await this.collectTotals(doc, gameId);
    const baseline: BaselineSnapshot = {
      touchdowns: totals.touchdowns,
      fieldGoals: totals.fieldGoals,
      safeties: totals.safeties,
      capturedAt: new Date().toISOString(),
      gameId,
    };
    await this.setBaseline(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, 'scorcerer_baseline', {
      touchdowns: totals.touchdowns,
      fieldGoals: totals.fieldGoals,
      safeties: totals.safeties,
      captured_at: baseline.capturedAt,
    });
    return baseline;
  }

  private async recordHistory(
    betId: string,
    eventType: 'scorcerer_result' | 'scorcerer_baseline',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const supa = getSupabase();
      const { error } = await supa
        .from('resolution_history')
        .insert([{ bet_id: betId, event_type: eventType, payload }]);
      if (error) {
        console.error('[scorcerer] failed to record history event', { betId, eventType }, error);
      }
    } catch (err: unknown) {
      console.error('[scorcerer] history record error', { betId, eventType }, err);
    }
  }

  private snapshotKey(gameId: string): string {
    return `scorcerer:snapshot:${gameId}`;
  }

  private isFinalStatus(doc: RefinedGameDoc | null | undefined): boolean {
    if (!doc) return false;
    const status = String((doc as any)?.status ?? '').trim().toUpperCase();
    if (!status) return false;
    if (status === 'STATUS_FINAL') return true;
    return status.startsWith('STATUS_FINAL');
  }

  private normalizeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return 0;
  }

  private getRedis(): Redis {
    if (this.redisClient) return this.redisClient;
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('[scorcerer] REDIS_URL not configured; Redis is required');
    }
    try {
      const client = new Redis(url);
      client.on('error', (err: unknown) => console.error('[scorcerer] redis error', err));
      this.redisClient = client;
      console.log('[scorcerer] redis client initialized');
      return client;
    } catch (err: unknown) {
      throw new Error(`[scorcerer] failed to initialize redis client: ${String(err)}`);
    }
  }
}

export const scorcererValidator = new ScorcererValidatorService();
