/**
 * Table Creation Service
 *
 * Creates a new table and adds the host as the first member atomically
 * via the `create_table_with_host` RPC (single PostgreSQL transaction).
 */

import { getSupabaseAdmin } from '../../supabaseClient';
import { AppError } from '../../errors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('tableCreationService');

export interface CreateTableResult {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
}

/**
 * Create a new table and add the host as the initial member.
 *
 * Delegates to the `create_table_with_host` PL/pgSQL RPC which
 * inserts both rows in a single transaction — no orphan tables.
 */
export async function createTableWithHost(
  tableName: string,
  hostUserId: string,
): Promise<CreateTableResult> {
  if (!tableName || !tableName.trim()) {
    throw AppError.badRequest('Table name is required');
  }

  const trimmed = tableName.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    throw AppError.badRequest('Table name must be between 1 and 50 characters');
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('create_table_with_host', {
    p_table_name: trimmed,
    p_host_user_id: hostUserId,
  });

  if (error) {
    const msg = error.message ?? 'Failed to create table';

    if (msg.includes('Table name is required')) {
      throw AppError.badRequest('Table name is required');
    }

    logger.error({ error: msg, hostUserId }, 'create_table_with_host RPC failed');
    throw AppError.internal('Failed to create table');
  }

  const result = data as CreateTableResult;
  logger.info({ tableId: result.table_id, hostUserId }, 'table created');
  return result;
}
