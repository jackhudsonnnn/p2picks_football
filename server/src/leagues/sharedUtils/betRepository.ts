import type { PostgrestError } from '@supabase/supabase-js';
import { getSupabaseAdmin, type BetProposal } from '../../supabaseClient';

export type HistoryEventType = string;

export interface WashResult {
  bet_id: string;
  table_id: string | null;
}

export class BetRepository {
  private readonly supabase = getSupabaseAdmin();

  async listPendingBets(modeKey: string, filters?: { gameId?: string | null }): Promise<BetProposal[]> {
    let query = this.supabase
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', modeKey)
      .eq('bet_status', 'pending');
    if (filters?.gameId) {
      query = query.eq('league_game_id', filters.gameId);
    }
    const { data, error } = await query;
    if (error) {
      throw this.wrapError('[betRepository] list pending bets error', error, { modeKey, filters });
    }
    return (data as BetProposal[]) || [];
  }

  async setWinningChoice(betId: string, winningChoice: string): Promise<boolean> {
    const { error, data } = await this.supabase
      .from('bet_proposals')
      .update({ winning_choice: winningChoice })
      .eq('bet_id', betId)
      .is('winning_choice', null)
      .select('bet_id');
    if (error) {
      throw this.wrapError('[betRepository] set winning choice error', error, { betId, winningChoice });
    }
    return Boolean(data && data.length > 0);
  }

  async recordHistory(betId: string, eventType: HistoryEventType, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from('resolution_history').insert([
      {
        bet_id: betId,
        event_type: eventType,
        payload,
      },
    ]);
    if (error) {
      throw this.wrapError('[betRepository] record history error', error, { betId, eventType });
    }
  }

  async washBet(betId: string): Promise<WashResult | null> {
    const updates = {
      bet_status: 'washed' as const,
      winning_choice: null as string | null,
      resolution_time: new Date().toISOString(),
    };
    const { data, error } = await this.supabase
      .from('bet_proposals')
      .update(updates)
      .eq('bet_id', betId)
      .eq('bet_status', 'pending')
      .select('bet_id, table_id')
      .maybeSingle();
    if (error) {
      throw this.wrapError('[betRepository] wash bet error', error, { betId });
    }
    return data as WashResult | null;
  }

  private wrapError(message: string, error: PostgrestError, context: Record<string, unknown>) {
    console.error(message, context, error);
    return Object.assign(new Error(`${message}: ${error.message}`), { cause: error });
  }
}

export const betRepository = new BetRepository();
