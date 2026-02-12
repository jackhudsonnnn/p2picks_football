/**
 * Table Repository
 *
 * Data access for table entities.
 * Handles queries related to betting tables and memberships.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository, type PaginatedResult } from './BaseRepository';
import { normalizeTimestamp } from '../utils/pagination';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Table {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
  last_activity_at: string | null;
}

export interface TableWithDetails extends Table {
  host_username: string | null;
  member_count: number;
  is_member: boolean;
}

export interface TableCursor {
  activityAt: string;
  tableId: string;
}

export interface ListTablesOptions {
  userId: string;
  limit?: number;
  before?: TableCursor;
  after?: TableCursor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export class TableRepository extends BaseRepository {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'tableRepository');
  }

  /**
   * List tables with cursor-based pagination.
   */
  async listTables(options: ListTablesOptions): Promise<PaginatedResult<TableWithDetails>> {
    const { userId, before, after } = options;
    const limit = this.parseLimit(options.limit);

    let query = this.supabase
      .from('tables')
      .select(
        `
        table_id,
        table_name,
        host_user_id,
        created_at,
        last_activity_at,
        host:host_user_id (username),
        table_members (user_id)
      `,
      )
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('table_id', { ascending: false })
      .limit(limit + 1);

    if (before) {
      query = query.or(
        `and(last_activity_at.lt.${before.activityAt}),and(last_activity_at.eq.${before.activityAt},table_id.lt.${before.tableId})`,
      );
    }

    if (after) {
      query = query.or(
        `and(last_activity_at.gt.${after.activityAt}),and(last_activity_at.eq.${after.activityAt},table_id.gt.${after.tableId})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw this.wrapError('listTables query error', error, { userId, before, after });
    }

    let rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    const tables: TableWithDetails[] = rows.map((row) => ({
      table_id: row.table_id,
      table_name: row.table_name,
      host_user_id: row.host_user_id,
      created_at: normalizeTimestamp(row.created_at),
      last_activity_at: normalizeTimestamp(row.last_activity_at ?? row.created_at ?? null),
      host_username: row.host?.username ?? null,
      member_count: Array.isArray(row.table_members) ? row.table_members.length : 0,
      is_member: Array.isArray(row.table_members)
        ? row.table_members.some((m: any) => m.user_id === userId)
        : false,
    }));

    return { data: tables, hasMore };
  }

  /**
   * Find a table by ID.
   */
  async findById(tableId: string): Promise<Table | null> {
    const { data, error } = await this.supabase
      .from('tables')
      .select('table_id, table_name, host_user_id, created_at, last_activity_at')
      .eq('table_id', tableId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('findById query error', error, { tableId });
    }

    return data as Table | null;
  }

  /**
   * Check if a user is a member of a table.
   */
  async isMember(tableId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('table_members')
      .select('user_id')
      .eq('table_id', tableId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('isMember query error', error, { tableId, userId });
    }

    return data !== null;
  }

  /**
   * Check if a user is the host of a table.
   */
  async isHost(tableId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('tables')
      .select('host_user_id')
      .eq('table_id', tableId)
      .eq('host_user_id', userId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('isHost query error', error, { tableId, userId });
    }

    return data !== null;
  }

  /**
   * Update last activity timestamp.
   */
  async touchActivity(tableId: string): Promise<void> {
    const { error } = await this.supabase
      .from('tables')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('table_id', tableId);

    if (error) {
      throw this.wrapError('touchActivity error', error, { tableId });
    }
  }

  /**
   * Get member count for a table.
   */
  async getMemberCount(tableId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('table_members')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId);

    if (error) {
      throw this.wrapError('getMemberCount error', error, { tableId });
    }

    return count ?? 0;
  }
}
