import Redis from 'ioredis';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabaseAdmin, BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { loadRefinedGame, RefinedGameDoc } from '../../../helpers';
import { GameFeedEvent, getCachedGameDoc, subscribeToGameFeed } from '../../../services/gameFeedService';

interface ChooseTheirFateConfig {
  possession_team_id?: string | null;
  possession_team_name?: string | null;
  nfl_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
}

interface TeamScoreSnapshot {
  touchdowns: number;
  fieldGoals: number;
}

interface ChooseFateBaseline {
  gameId: string;
  possessionTeamId: string | null;
  capturedAt: string;
  teams: Record<string, TeamScoreSnapshot>;
}

export class ChooseTheirFateValidatorService {
  private unsubscribe: (() => void) | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private redisClient: Redis | null = null;
  private readonly baselineTtlSeconds = 60 * 60 * 6;
  private lastSignatureByGame = new Map<string, string>();

  start() {
    this.getRedis();
    this.startPendingMonitor();
    this.syncPendingBaselines().catch((err: unknown) => console.error('[chooseTheirFate] baseline sync error', err));
    this.startFeedSubscription();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) => console.error('[chooseTheirFate] pending channel unsubscribe error', err));
      this.pendingChannel = null;
    }
    if (this.redisClient) {
      this.redisClient.quit().catch((err: unknown) => console.error('[chooseTheirFate] redis quit error', err));
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
      .channel('choose-their-fate-pending')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.choose_their_fate' }, (payload) => {
        void this.handleBetProposalUpdate(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.choose_their_fate' }, (payload) => {
        void this.handleBetProposalDelete(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[chooseTheirFate] pending monitor ready');
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
      console.error('[chooseTheirFate] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const oldRow = (payload.old || {}) as Partial<BetProposal>;
      if (oldRow?.bet_id) {
        await this.clearBaseline(oldRow.bet_id);
      }
    } catch (err: unknown) {
      console.error('[chooseTheirFate] pending delete handler error', err);
    }
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const { data, error } = await supa
        .from('bet_proposals')
        .select('bet_id, nfl_game_id')
        .eq('mode_key', 'choose_their_fate')
        .eq('bet_status', 'pending');
      if (error) throw error;
      for (const row of data || []) {
        const baseline = await this.getBaseline(row.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(row as BetProposal);
        }
      }
    } catch (err: unknown) {
      console.error('[chooseTheirFate] sync pending baselines failed', err);
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
      console.error('[chooseTheirFate] game feed event error', { gameId: event.gameId }, err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc) {
  const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'choose_their_fate')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[chooseTheirFate] list pending bets error', { gameId }, error);
      return;
    }
    for (const bet of (data as BetProposal[]) || []) {
      await this.evaluateBet(bet, doc);
    }
  }

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc) {
    try {
      const statusForWashCheck = (doc.status ? String(doc.status) : '').trim().toUpperCase();
      if (this.shouldAutoWashForStatus(statusForWashCheck)) {
        await this.washBet(bet.bet_id, {
          outcome: 'wash',
          reason: 'game_status',
          status: doc.status ?? null,
          captured_at: new Date().toISOString(),
        });
        await this.clearBaseline(bet.bet_id);
        return;
      }
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[chooseTheirFate] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const baseline = (await this.getBaseline(bet.bet_id)) || (await this.captureBaselineForBet(bet, doc));
      if (!baseline) {
        console.warn('[chooseTheirFate] baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const currentScores = this.collectTeamScores(doc);
      const touchdownTeam = this.firstIncrease(baseline.teams, currentScores, 'touchdowns');
      const fieldGoalTeam = this.firstIncrease(baseline.teams, currentScores, 'fieldGoals');
      const possessionTeam = this.possessionTeamIdFromDoc(doc);
      if (touchdownTeam) {
        await this.setResult(bet.bet_id, 'TD', {
          outcome: 'TD',
          scoring_team_id: touchdownTeam,
          captured_at: new Date().toISOString(),
        });
        await this.clearBaseline(bet.bet_id);
        return;
      }
      if (fieldGoalTeam) {
        await this.setResult(bet.bet_id, 'FG', {
          outcome: 'FG',
          scoring_team_id: fieldGoalTeam,
          captured_at: new Date().toISOString(),
        });
        await this.clearBaseline(bet.bet_id);
        return;
      }
      const baselinePossession = baseline.possessionTeamId;
      if (baselinePossession && possessionTeam && possessionTeam !== baselinePossession) {
        await this.setResult(bet.bet_id, 'Turnover', {
          outcome: 'Turnover',
          from_team_id: baselinePossession,
          to_team_id: possessionTeam,
          captured_at: new Date().toISOString(),
        });
        await this.clearBaseline(bet.bet_id);
        return;
      }
    } catch (err: unknown) {
      console.error('[chooseTheirFate] evaluate bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private collectTeamScores(doc: RefinedGameDoc): Record<string, TeamScoreSnapshot> {
    const map: Record<string, TeamScoreSnapshot> = {};
    for (const rawTeam of doc.teams || []) {
      const team: any = rawTeam;
      const teamId = this.normalizeTeamId(team?.teamId || team?.abbreviation || null);
      if (!teamId) continue;
      const scoring = (team?.stats || {}).scoring || {};
      map[teamId] = {
        touchdowns: this.normalizeNumber((scoring as any).touchdowns),
        fieldGoals: this.normalizeNumber((scoring as any).fieldGoals),
      };
    }
    return map;
  }

  private firstIncrease(
    baseline: Record<string, TeamScoreSnapshot>,
    current: Record<string, TeamScoreSnapshot>,
    field: keyof TeamScoreSnapshot,
  ): string | null {
    for (const [teamId, base] of Object.entries(baseline)) {
      const now = current[teamId];
      if (!now) continue;
      if (now[field] > base[field]) {
        return teamId;
      }
    }
    return null;
  }

  private async setResult(betId: string, winningChoice: 'TD' | 'FG' | 'Turnover', payload: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
    const { error } = await supa
      .from('bet_proposals')
      .update({ winning_choice: winningChoice })
      .eq('bet_id', betId)
      .is('winning_choice', null);
    if (error) {
      console.error('[chooseTheirFate] failed to set winning_choice', { betId, winningChoice }, error);
      return;
    }
    await this.recordHistory(betId, 'choose_their_fate_result', payload);
  }

  private async captureBaselineForBet(bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null }, prefetchedDoc?: RefinedGameDoc | null): Promise<ChooseFateBaseline | null> {
    const existing = await this.getBaseline(bet.bet_id);
    if (existing) return existing;
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      console.warn('[chooseTheirFate] cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      console.warn('[chooseTheirFate] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    let doc = prefetchedDoc ?? getCachedGameDoc(gameId) ?? null;
    if (!doc) {
      doc = await loadRefinedGame(gameId);
    }
    if (!doc) {
      console.warn('[chooseTheirFate] refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const statusForWashCheck = (doc.status ? String(doc.status) : '').trim().toUpperCase();
    if (this.shouldAutoWashForStatus(statusForWashCheck)) {
      await this.washBet(bet.bet_id, {
        outcome: 'wash',
        reason: 'game_status',
        status: doc.status ?? null,
        captured_at: new Date().toISOString(),
      });
      await this.clearBaseline(bet.bet_id);
      return null;
    }
    const possessionTeamId = this.possessionTeamIdFromDoc(doc) ?? this.normalizeTeamId(config.possession_team_id ?? null);
    const baseline: ChooseFateBaseline = {
      gameId,
      possessionTeamId,
      capturedAt: new Date().toISOString(),
      teams: this.collectTeamScores(doc),
    };
    await this.setBaseline(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, 'choose_their_fate_baseline', {
      event: 'baseline',
      captured_at: baseline.capturedAt,
      possession_team_id: baseline.possessionTeamId,
      teams: baseline.teams,
    });
    return baseline;
  }

  private async getConfigForBet(betId: string): Promise<ChooseTheirFateConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'choose_their_fate') return null;
      return record.data as ChooseTheirFateConfig;
    } catch (err: unknown) {
      console.error('[chooseTheirFate] fetch config error', { betId }, err);
      return null;
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

  private possessionTeamIdFromDoc(doc: RefinedGameDoc | null | undefined): string | null {
    if (!doc || !Array.isArray(doc.teams)) return null;
    for (const rawTeam of doc.teams) {
      const team: any = rawTeam;
      if (team && team.possession) {
        return this.normalizeTeamId(team.teamId ?? team.abbreviation ?? null);
      }
    }
    return null;
  }

  private normalizeTeamId(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str ? str : null;
  }

  private baselineKey(betId: string): string {
    return `choosefate:baseline:${betId}`;
  }

  private async setBaseline(betId: string, baseline: ChooseFateBaseline): Promise<void> {
    const key = this.baselineKey(betId);
    const redis = this.getRedis();
    const value = JSON.stringify(baseline);
    try {
      await redis.set(key, value, 'EX', this.baselineTtlSeconds);
    } catch (err: unknown) {
      console.error('[chooseTheirFate] redis baseline set error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async getBaseline(betId: string): Promise<ChooseFateBaseline | null> {
    const key = this.baselineKey(betId);
    const redis = this.getRedis();
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as ChooseFateBaseline;
    } catch (err: unknown) {
      console.error('[chooseTheirFate] redis baseline get error', { betId }, err);
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
      console.error('[chooseTheirFate] redis baseline clear error', { betId }, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async washBet(betId: string, payload: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
    const updates = {
      bet_status: 'washed' as const,
      winning_choice: null as string | null,
      resolution_time: new Date().toISOString(),
    };
    const { error } = await supa
      .from('bet_proposals')
      .update(updates)
      .eq('bet_id', betId)
      .eq('bet_status', 'pending');
    if (error) {
      console.error('[chooseTheirFate] failed to wash bet', { betId }, error);
      return;
    }
    await this.recordHistory(betId, 'choose_their_fate_result', payload);
  }

  private shouldAutoWashForStatus(rawStatus: string | null | undefined): boolean {
    if (!rawStatus) return false;
    const status = String(rawStatus).trim().toUpperCase();
    if (!status || status === 'STATUS_IN_PROGRESS') return false;
    if (status.includes('HALFTIME')) return true;
    if (status.startsWith('STATUS_FINAL')) return true;
    if (status.startsWith('STATUS_END')) return true;
    if (status.includes('POSTPONED') || status.includes('SUSPENDED')) return true;
    return false;
  }

  private async recordHistory(
    betId: string,
    eventType: 'choose_their_fate_result' | 'choose_their_fate_baseline',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
  const supa = getSupabaseAdmin();
      const { error } = await supa
        .from('resolution_history')
        .insert([{ bet_id: betId, event_type: eventType, payload }]);
      if (error) {
        console.error('[chooseTheirFate] failed to record history event', { betId, eventType }, error);
      }
    } catch (err: unknown) {
      console.error('[chooseTheirFate] history record error', { betId, eventType }, err);
    }
  }

  private getRedis(): Redis {
    if (this.redisClient) return this.redisClient;
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('[chooseTheirFate] REDIS_URL not configured; Redis is required');
    }
    try {
      const client = new Redis(url);
      client.on('error', (err: unknown) => console.error('[chooseTheirFate] redis error', err));
      this.redisClient = client;
      console.log('[chooseTheirFate] redis client initialized');
      return client;
    } catch (err: unknown) {
      throw new Error(`[chooseTheirFate] failed to initialize redis client: ${String(err)}`);
    }
  }
}

export const chooseTheirFateValidator = new ChooseTheirFateValidatorService();
