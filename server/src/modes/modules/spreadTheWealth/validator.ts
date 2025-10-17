import { getSupabaseAdmin, type BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { subscribeToGameFeed, type GameFeedEvent } from '../../../services/gameFeedService';
import type { RefinedGameDoc } from '../../../helpers';

interface SpreadTheWealthConfig {
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  nfl_game_id?: string | null;
}

export class SpreadTheWealthValidatorService {
  private unsubscribe: (() => void) | null = null;
  private lastSignatureByGame = new Map<string, string>();

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribeToGameFeed((event) => {
      void this.handleGameFeedEvent(event);
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.lastSignatureByGame.clear();
  }

  private async handleGameFeedEvent(event: GameFeedEvent): Promise<void> {
    try {
      const { gameId, doc, signature } = event;
      if (this.lastSignatureByGame.get(gameId) === signature) return;
      this.lastSignatureByGame.set(gameId, signature);
      const status = String(doc.status || '').toUpperCase();
      if (status !== 'STATUS_FINAL') return;
      await this.processFinalGame(gameId, doc);
    } catch (err: unknown) {
      console.error('[spreadTheWealth] game feed error', { gameId: event.gameId }, err);
    }
  }

  private async processFinalGame(gameId: string, doc: RefinedGameDoc): Promise<void> {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'spread_the_wealth')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[spreadTheWealth] list pending bets error', { gameId }, error);
      return;
    }
    for (const row of (data as BetProposal[]) || []) {
      await this.resolveBet(row, doc);
    }
  }

  private async resolveBet(bet: BetProposal, doc: RefinedGameDoc): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[spreadTheWealth] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const line = this.normalizeLine(config);
      if (line == null) {
        console.warn('[spreadTheWealth] invalid line; washing bet', { bet_id: bet.bet_id, config });
        await this.washBet(bet.bet_id, {
          outcome: 'wash',
          reason: 'invalid_line',
          captured_at: new Date().toISOString(),
          config,
        });
        return;
      }
      const totalPoints = this.computeTotalPoints(doc);
      const delta = totalPoints - line;
      if (Math.abs(delta) < 1e-9) {
        await this.washBet(bet.bet_id, {
          outcome: 'wash',
          reason: 'push',
          total_points: totalPoints,
          line,
          captured_at: new Date().toISOString(),
        });
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
        console.error('[spreadTheWealth] failed to set winning choice', { bet_id: bet.bet_id, winningChoice }, updErr);
        return;
      }
      await this.recordHistory(bet.bet_id, {
        outcome: winningChoice,
        total_points: totalPoints,
        line,
        line_label: config.line_label ?? config.line ?? null,
        captured_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('[spreadTheWealth] resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private computeTotalPoints(doc: RefinedGameDoc): number {
    const teams = Array.isArray(doc.teams) ? (doc.teams as any[]) : [];
    let total = 0;
    for (const team of teams) {
      total += this.normalizeScore((team as any)?.score);
    }
    return total;
  }

  private normalizeScore(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
    return 0;
  }

  private normalizeLine(config: SpreadTheWealthConfig): number | null {
    if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
      return config.line_value;
    }
    if (typeof config.line === 'string') {
      const parsed = Number.parseFloat(config.line);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private async getConfigForBet(betId: string): Promise<SpreadTheWealthConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'spread_the_wealth') return null;
      return record.data as SpreadTheWealthConfig;
    } catch (err: unknown) {
      console.error('[spreadTheWealth] fetch config error', { betId }, err);
      return null;
    }
  }

  private async washBet(betId: string, payload: Record<string, unknown>): Promise<void> {
    try {
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
        console.error('[spreadTheWealth] failed to wash bet', { betId }, error);
        return;
      }
      await this.recordHistory(betId, {
        ...payload,
        event: 'spread_the_wealth_result',
      });
    } catch (err: unknown) {
      console.error('[spreadTheWealth] wash bet error', { betId }, err);
    }
  }

  private async recordHistory(betId: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const { error } = await supa
        .from('resolution_history')
        .insert([{ bet_id: betId, event_type: 'spread_the_wealth_result', payload }]);
      if (error) {
        console.error('[spreadTheWealth] history record error', { betId }, error);
      }
    } catch (err: unknown) {
      console.error('[spreadTheWealth] history insert error', { betId }, err);
    }
  }
}

export const spreadTheWealthValidator = new SpreadTheWealthValidatorService();
