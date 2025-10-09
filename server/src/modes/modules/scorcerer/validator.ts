import { getSupabase, BetProposal } from '../../../supabaseClient';
import { getTeamScoreStats } from '../../../get-functioins';
import { loadRefinedGame, REFINED_DIR, RefinedGameDoc } from '../../../helpers';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import chokidar from 'chokidar';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import * as path from 'path';

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

interface GameSnapshot {
  signatureJson: string;
  signatureHash: string;
  totals: AggregateTotals;
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
  private watcher: chokidar.FSWatcher | null = null;
  private redisClient: Redis | null = null;
  private redisInitAttempted = false;
  private readonly redisSnapshotTtlSeconds = 60 * 60 * 6;
  private readonly storeRawSnapshots = process.env.SCORCERER_STORE_RAW === '1' || process.env.SCORCERER_STORE_RAW === 'true';
  private pendingChannel: RealtimeChannel | null = null;
  private readonly baselineTtlSeconds = 60 * 60 * 12;

  // in-memory fallback (key -> { hash: valueStored, expiresAt })
  // memorySnapshots maps key -> { storedValue: string; canonicalHash: string; expiresAt }
  private readonly memorySnapshots = new Map<string, { storedValue: string; canonicalHash: string; expiresAt: number }>();
  private memorySnapshotsWarned = false;
  private readonly memoryBaselines = new Map<string, { value: BaselineSnapshot; expiresAt: number }>();
  private memoryBaselineWarned = false;

  start() {
    this.startPendingMonitor();
    this.syncPendingBaselines().catch((err: unknown) => console.error('[scorcerer] baseline sync error', err));
    // Watch-mode only: trigger validation when refined JSON files are added/changed
    this.startWatcher();
  }

  stop() {
    if (this.watcher) this.watcher.close().catch(() => {});
    this.watcher = null;
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) => console.error('[scorcerer] pending channel unsubscribe error', err));
      this.pendingChannel = null;
    }
    if (this.redisClient) {
      this.redisClient.quit().catch((err: unknown) => console.error('[scorcerer] redis quit error', err));
      this.redisClient = null;
      this.redisInitAttempted = false;
    }
    this.memorySnapshots.clear();
    this.memoryBaselines.clear();
  }

  private startWatcher() {
    if (this.watcher) return;
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    console.log('[scorcerer] starting watcher on', dir);
    this.watcher = chokidar
      .watch(path.join(dir, '*.json'), { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 } })
      .on('add', (file) => this.onFileChanged(file))
      .on('change', (file) => this.onFileChanged(file))
      .on('error', (err: unknown) => console.error('[scorcerer] watcher error', err));
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

  private cleanupMemoryBaselines() {
    const now = Date.now();
    for (const [key, entry] of this.memoryBaselines) {
      if (entry.expiresAt <= now) {
        this.memoryBaselines.delete(key);
      }
    }
  }

  private async setBaseline(betId: string, baseline: BaselineSnapshot): Promise<void> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    const value = JSON.stringify(baseline);
    if (redis) {
      try {
        await redis.set(key, value, 'EX', this.baselineTtlSeconds);
        return;
      } catch (err: unknown) {
        console.error('[scorcerer] redis baseline set error', { betId }, err);
      }
    }
    this.cleanupMemoryBaselines();
    this.memoryBaselines.set(key, { value: baseline, expiresAt: Date.now() + this.baselineTtlSeconds * 1000 });
    if (!this.memoryBaselineWarned) {
      console.warn('[scorcerer] baseline fallback to in-memory storage; Redis disabled or unavailable');
      this.memoryBaselineWarned = true;
    }
  }

  private async getBaseline(betId: string): Promise<BaselineSnapshot | null> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    if (redis) {
      try {
        const raw = await redis.get(key);
        if (raw) return JSON.parse(raw) as BaselineSnapshot;
      } catch (err: unknown) {
        console.error('[scorcerer] redis baseline get error', { betId }, err);
      }
    }
    this.cleanupMemoryBaselines();
    const entry = this.memoryBaselines.get(key);
    return entry ? entry.value : null;
  }

  private async clearBaseline(betId: string): Promise<void> {
    const redis = this.getRedis();
    const key = this.baselineKey(betId);
    if (redis) {
      try {
        await redis.del(key);
      } catch (err: unknown) {
        console.error('[scorcerer] redis baseline clear error', { betId }, err);
      }
    }
    this.memoryBaselines.delete(key);
  }

  private async onFileChanged(filePath: string) {
    const gameId = path.basename(filePath, '.json');
    try {
      const doc = await loadRefinedGame(gameId);
      if (!doc) return;
      await this.processGameUpdate(gameId, doc);
    } catch (err: unknown) {
      console.error('[scorcerer] onFileChanged error', { filePath }, err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc) {
    const snapshot = await this.captureSnapshot(gameId, doc);
    if (!snapshot.shouldProcess) {
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
      await this.evaluateBet(bet, doc, snapshot);
    }
  }

  private async captureSnapshot(gameId: string, doc: RefinedGameDoc): Promise<SnapshotRecord> {
    const totals = await this.collectTotals(doc, gameId);
    const signatureJson = JSON.stringify(totals);
    const signatureHash = createHash('sha256').update(signatureJson).digest('hex');
    const cacheKey = this.snapshotKey(gameId);

    const redis = this.getRedis();
    if (redis) {
      try {
        const raw = await redis.get(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { signatureHash: string; signatureJson?: string };
          if (parsed.signatureHash === signatureHash) {
            return { shouldProcess: false, previousHash: signatureHash };
          }
        }
        await redis.set(cacheKey, JSON.stringify({ signatureHash, signatureJson: this.storeRawSnapshots ? signatureJson : undefined }), 'EX', this.redisSnapshotTtlSeconds);
        return { shouldProcess: true, previousHash: null };
      } catch (err: unknown) {
        console.error('[scorcerer] redis snapshot error', { gameId }, err);
      }
    }

    const entry = this.memorySnapshots.get(cacheKey);
    if (entry && entry.canonicalHash === signatureHash) {
      return { shouldProcess: false, previousHash: signatureHash };
    }
    this.cleanupMemorySnapshots();
    this.memorySnapshots.set(cacheKey, { storedValue: this.storeRawSnapshots ? signatureJson : '', canonicalHash: signatureHash, expiresAt: Date.now() + this.redisSnapshotTtlSeconds * 1000 });
    if (!this.memorySnapshotsWarned) {
      console.warn('[scorcerer] snapshot fallback to in-memory storage; Redis disabled or unavailable');
      this.memorySnapshotsWarned = true;
    }
    return { shouldProcess: true, previousHash: entry?.canonicalHash ?? null };
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

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc, snapshot: SnapshotRecord) {
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

  private async captureBaselineForBet(bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null }, prefetchedDoc?: RefinedGameDoc | null): Promise<BaselineSnapshot | null> {
    const existing = await this.getBaseline(bet.bet_id);
    if (existing) return existing;
    const gameId = bet.nfl_game_id || null;
    if (!gameId) {
      console.warn('[scorcerer] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    let doc = prefetchedDoc ?? null;
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

  private cleanupMemorySnapshots() {
    const now = Date.now();
    for (const [key, entry] of this.memorySnapshots) {
      if (entry.expiresAt <= now) {
        this.memorySnapshots.delete(key);
      }
    }
  }

  private normalizeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return 0;
  }

  private getRedis(): Redis | null {
    if (this.redisClient) return this.redisClient;
    if (this.redisInitAttempted) return this.redisClient;
    this.redisInitAttempted = true;
    const url = process.env.REDIS_URL;
    if (!url) {
      console.error('[scorcerer] redis url not configured; validator requires Redis for durability');
      return null;
    }
    try {
      const client = new Redis(url);
      client.on('error', (err: unknown) => console.error('[scorcerer] redis error', err));
      this.redisClient = client;
      console.log('[scorcerer] redis client initialized');
    } catch (err: unknown) {
      console.error('[scorcerer] failed to initialize redis client', err);
      this.redisClient = null;
    }
    return this.redisClient;
  }
}

export const scorcererValidator = new ScorcererValidatorService();
