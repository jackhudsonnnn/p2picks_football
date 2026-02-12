/**
 * Ticket Repository
 *
 * Data access for bet participations (tickets).
 * A "ticket" represents a user's participation in a bet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository, type PaginatedResult } from './BaseRepository';
import { normalizeTimestamp } from '../utils/pagination';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Ticket {
  participation_id: string;
  bet_id: string;
  table_id: string | null;
  user_id: string;
  user_guess: string;
  participation_time: string;
}

export interface TicketWithBet extends Ticket {
  bet: {
    bet_id: string;
    table_id: string | null;
    league: string;
    league_game_id: string | null;
    mode_key: string;
    description: string | null;
    wager_amount: number;
    time_limit_seconds: number;
    proposal_time: string;
    bet_status: string;
    close_time: string | null;
    winning_choice: string | null;
    resolution_time: string | null;
    table_name: string | null;
  };
}

export interface TicketCursor {
  participatedAt: string;
  participationId: string;
}

export interface ListTicketsOptions {
  userId: string;
  limit?: number;
  before?: TicketCursor;
  after?: TicketCursor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export class TicketRepository extends BaseRepository {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticketRepository');
  }

  /**
   * List tickets with cursor-based pagination.
   */
  async listTickets(options: ListTicketsOptions): Promise<PaginatedResult<TicketWithBet>> {
    const { userId, before, after } = options;
    const limit = this.parseLimit(options.limit);

    let query = this.supabase
      .from('bet_participations')
      .select(
        `
        participation_id,
        bet_id,
        table_id,
        user_id,
        user_guess,
        participation_time,
        bet_proposals:bet_id (
          bet_id,
          table_id,
          league,
          league_game_id,
          mode_key,
          description,
          wager_amount,
          time_limit_seconds,
          proposal_time,
          bet_status,
          close_time,
          winning_choice,
          resolution_time,
          tables:table_id (table_name)
        )
      `,
      )
      .eq('user_id', userId)
      .order('participation_time', { ascending: false })
      .order('participation_id', { ascending: false })
      .limit(limit + 1);

    if (before) {
      query = query.or(
        `and(participation_time.lt.${before.participatedAt}),and(participation_time.eq.${before.participatedAt},participation_id.lt.${before.participationId})`,
      );
    }

    if (after) {
      query = query.or(
        `and(participation_time.gt.${after.participatedAt}),and(participation_time.eq.${after.participatedAt},participation_id.gt.${after.participationId})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw this.wrapError('listTickets query error', error, { userId, before, after });
    }

    let rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    const tickets: TicketWithBet[] = rows.map((row) => {
      const betData = row.bet_proposals;
      return {
        participation_id: row.participation_id,
        bet_id: row.bet_id,
        table_id: row.table_id,
        user_id: row.user_id,
        user_guess: row.user_guess,
        participation_time: normalizeTimestamp(row.participation_time),
        bet: {
          bet_id: betData?.bet_id ?? row.bet_id,
          table_id: betData?.table_id ?? row.table_id,
          league: betData?.league ?? '',
          league_game_id: betData?.league_game_id ?? null,
          mode_key: betData?.mode_key ?? '',
          description: betData?.description ?? null,
          wager_amount: betData?.wager_amount ?? 0,
          time_limit_seconds: betData?.time_limit_seconds ?? 0,
          proposal_time: normalizeTimestamp(betData?.proposal_time),
          bet_status: betData?.bet_status ?? 'unknown',
          close_time: betData?.close_time ? normalizeTimestamp(betData.close_time) : null,
          winning_choice: betData?.winning_choice ?? null,
          resolution_time: betData?.resolution_time
            ? normalizeTimestamp(betData.resolution_time)
            : null,
          table_name: betData?.tables?.table_name ?? null,
        },
      };
    });

    return { data: tickets, hasMore };
  }

  /**
   * Find a ticket by participation ID.
   */
  async findById(participationId: string): Promise<Ticket | null> {
    const { data, error } = await this.supabase
      .from('bet_participations')
      .select('participation_id, bet_id, table_id, user_id, user_guess, participation_time')
      .eq('participation_id', participationId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('findById query error', error, { participationId });
    }

    return data as Ticket | null;
  }

  /**
   * Find all tickets for a specific bet.
   */
  async findByBetId(betId: string): Promise<Ticket[]> {
    const { data, error } = await this.supabase
      .from('bet_participations')
      .select('participation_id, bet_id, table_id, user_id, user_guess, participation_time')
      .eq('bet_id', betId)
      .order('participation_time', { ascending: true });

    if (error) {
      throw this.wrapError('findByBetId query error', error, { betId });
    }

    return (data ?? []) as Ticket[];
  }

  /**
   * Check if a user has already participated in a bet.
   */
  async hasParticipated(betId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bet_participations')
      .select('participation_id')
      .eq('bet_id', betId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('hasParticipated query error', error, { betId, userId });
    }

    return data !== null;
  }

  /**
   * Count participations for a bet.
   */
  async countParticipations(betId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('bet_participations')
      .select('*', { count: 'exact', head: true })
      .eq('bet_id', betId);

    if (error) {
      throw this.wrapError('countParticipations error', error, { betId });
    }

    return count ?? 0;
  }
}
