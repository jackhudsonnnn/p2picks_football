import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { BetProposal, getSupabaseAdmin } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { GameFeedEvent, getCachedGameDoc, subscribeToGameFeed } from '../../../services/gameFeedService';
import { findPlayer, loadRefinedGame, type RefinedGameDoc } from '../../../helpers';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT } from './constants';

interface PropHuntConfig {
  player_id?: string | null;
  player_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  nfl_game_id?: string | null;
  resolve_at?: string | null;
}

interface PendingCheckResult {
  crossed: boolean;
  currentValue: number | null;
  line: number;
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

export class PropHuntValidatorService {
  private unsubscribe: (() => void) | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private lastSignatureByGame = new Map<string, string>();
  private readonly resultEvent = 'prop_hunt_result';

  start(): void {
    this.startPendingMonitor();
    void this.syncPendingBets();
    this.startFeedSubscription();
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) =>
        console.error('[propHunt] pending channel unsubscribe error', err),
      );
      this.pendingChannel = null;
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
      .channel('prop-hunt-pending')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: 'mode_key=eq.prop_hunt' },
        (payload) => {
          void this.handleBetProposalUpdate(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[propHunt] pending monitor ready');
        }
      });
  }

  private async handleBetProposalUpdate(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const newRow = (payload.new || {}) as Partial<BetProposal> & { nfl_game_id?: string | null };
      const oldRow = (payload.old || {}) as Partial<BetProposal> & { nfl_game_id?: string | null };
      if (!newRow?.bet_id) return;
      if (newRow.bet_status === 'pending' && oldRow?.bet_status !== 'pending') {
        await this.handlePendingTransition(newRow as BetProposal);
      }
    } catch (err) {
      console.error('[propHunt] pending update handler error', err);
    }
  }

  private async syncPendingBets(): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const { data, error } = await supa
        .from('bet_proposals')
        .select('*')
        .eq('mode_key', 'prop_hunt')
        .eq('bet_status', 'pending');
      if (error) throw error;
      for (const row of (data as BetProposal[]) || []) {
        await this.handlePendingTransition(row);
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
      const line = this.normalizeLine(config);
      if (line == null) {
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'invalid_line',
            captured_at: new Date().toISOString(),
            config,
          },
          'Invalid prop line configuration.',
        );
        return;
      }
      const check = await this.evaluateLineCrossed(config, bet.nfl_game_id, line);
      if (check.crossed) {
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'line_already_crossed',
            current_value: check.currentValue,
            line: check.line,
            captured_at: new Date().toISOString(),
          },
          `Line (${this.formatNumber(check.line)}) already met before betting closed.`,
        );
      }
    } catch (err) {
      console.error('[propHunt] pending transition error', { bet_id: bet.bet_id }, err);
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
      console.error('[propHunt] game feed event error', { gameId: event.gameId }, err);
    }
  }

  private async processGame(gameId: string, doc: RefinedGameDoc, resolveAt: string): Promise<void> {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'prop_hunt')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[propHunt] list pending bets error', { gameId }, error);
      return;
    }
    for (const bet of (data as BetProposal[]) || []) {
      await this.resolveBet(bet, doc, resolveAt);
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
      const line = this.normalizeLine(config);
      if (line == null) {
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'invalid_line',
            captured_at: new Date().toISOString(),
            config,
          },
          'Invalid prop line configuration.',
        );
        return;
      }
      const finalValue = await this.readStatValue(config, bet.nfl_game_id, doc);
      if (finalValue == null) {
        console.warn('[propHunt] unable to determine final stat; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const delta = finalValue - line;
      if (Math.abs(delta) < 1e-9) {
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'push',
            final_value: finalValue,
            line,
            captured_at: new Date().toISOString(),
          },
          `Final value (${this.formatNumber(finalValue)}) matched the line.`,
        );
        return;
      }
      const winningChoice = delta > 0 ? 'Over' : 'Under';
      const supa = getSupabaseAdmin();
      const { error: updErr } = await supa
        .from('bet_proposals')
        .update({ winning_choice: winningChoice })
        .eq('bet_id', bet.bet_id)
        .is('winning_choice', null);
      if (updErr) {
        console.error('[propHunt] failed to set winning choice', { bet_id: bet.bet_id, winningChoice }, updErr);
        return;
      }
      await this.recordHistory(bet.bet_id, {
        outcome: winningChoice,
        final_value: finalValue,
        line,
        line_label: config.line_label ?? config.line ?? null,
        resolve_at: config.resolve_at ?? PROP_HUNT_DEFAULT_RESOLVE_AT,
        captured_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[propHunt] resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    try {
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
        console.error('[propHunt] failed to wash bet', { betId }, error);
        return;
      }
      if (!data) {
        console.warn('[propHunt] wash skipped; bet not pending', { betId });
        return;
      }
      await this.recordHistory(betId, { ...payload, outcome: payload.outcome ?? 'wash' });
      if (!data.table_id) {
        console.warn('[propHunt] wash message skipped; table_id missing', { betId });
        return;
      }
      await this.createWashSystemMessage(data.table_id, betId, explanation);
    } catch (err) {
      console.error('[propHunt] wash bet error', { betId }, err);
    }
  }

  private async evaluateLineCrossed(config: PropHuntConfig, nflGameId: string | null | undefined, line: number): Promise<PendingCheckResult> {
    const statValue = await this.readStatValue(config, nflGameId);
    if (statValue == null) {
      return { crossed: false, currentValue: null, line };
    }
    return { crossed: statValue >= line, currentValue: statValue, line };
  }

  private async readStatValue(
    config: PropHuntConfig,
    nflGameId: string | null | undefined,
    prefetchedDoc?: RefinedGameDoc | null,
  ): Promise<number | null> {
    const statKey = config.stat || '';
    const spec = PLAYER_STAT_MAP[statKey];
    if (!spec) return null;
    const gameId = config.nfl_game_id || nflGameId;
    if (!gameId) return null;
    let doc = prefetchedDoc ?? getCachedGameDoc(gameId) ?? null;
    if (!doc) {
      doc = await loadRefinedGame(gameId);
    }
    if (!doc) return null;
    return this.getPlayerStatValue(doc, { id: config.player_id, name: config.player_name }, statKey);
  }

  private getPlayerStatValue(doc: RefinedGameDoc, ref: { id?: string | null; name?: string | null }, statKey: string): number | null {
    const spec = PLAYER_STAT_MAP[statKey];
    if (!spec) return null;
    const player = this.lookupPlayer(doc, ref);
    if (!player) return null;
    const categories = (player as any).stats || {};
    const category = (categories as any)[spec.category];
    if (!category || typeof category !== 'object') return null;
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

  private normalizeStatValue(raw: unknown): number | null {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw === 'string') {
      const first = raw.split('/')[0];
      const num = Number(first);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  }

  private normalizeLine(config: PropHuntConfig): number | null {
    if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
      return config.line_value;
    }
    if (typeof config.line === 'string') {
      const parsed = Number.parseFloat(config.line);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
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

  private async recordHistory(betId: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const entry = {
        bet_id: betId,
        event_type: this.resultEvent,
        payload,
      };
      const { error } = await supa.from('resolution_history').insert([entry]);
      if (error) {
        console.error('[propHunt] history record error', { betId }, error);
      }
    } catch (err) {
      console.error('[propHunt] history insert error', { betId }, err);
    }
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
        console.error('[propHunt] failed to create wash system message', { betId, tableId }, error);
      }
    } catch (err) {
      console.error('[propHunt] wash system message error', { betId, tableId }, err);
    }
  }

  private formatBetLabel(betId: string): string {
    if (!betId) return 'UNKNOWN';
    const trimmed = betId.trim();
    if (!trimmed) return 'UNKNOWN';
    return trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
  }

  private formatNumber(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
    const fractional = Math.abs(value % 1) > 1e-9;
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractional ? 1 : 0,
      maximumFractionDigits: fractional ? 1 : 0,
    });
    return formatter.format(value);
  }
}

export const propHuntValidator = new PropHuntValidatorService();
