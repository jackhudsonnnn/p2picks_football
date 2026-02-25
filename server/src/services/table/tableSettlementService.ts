/**
 * Table Settlement Service
 *
 * Handles the "settle" workflow for a betting table via the atomic
 * `settle_table` RPC. The RPC runs entirely in a single PostgreSQL
 * transaction so balances are either all settled or none are.
 *
 * 1. Only the table host may initiate settlement.
 * 2. All active (non-resolved, non-washed) bets on the table must be
 *    resolved before settlement can proceed.
 * 3. Settlement adjusts every member's running balance and records a
 *    settlement event in `table_settlements` for auditability.
 * 4. After settlement the table remains open for future bets.
 */

import { getSupabaseAdmin } from '../../supabaseClient';
import { AppError } from '../../errors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('tableSettlementService');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SettlementResult {
  tableId: string;
  settledAt: string;
  memberCount: number;
  /** Snapshot of each member's balance at the time of settlement. */
  balances: MemberBalanceSnapshot[];
}

export interface MemberBalanceSnapshot {
  userId: string;
  bustBalanceBefore: number;
  pushBalanceBefore: number;
  sweepBalanceBefore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Settle a table — adjust all member balances and record the event.
 *
 * Delegates entirely to the `settle_table` PL/pgSQL RPC which runs
 * atomically inside a single database transaction.
 *
 * @throws AppError 403 if the requesting user is not the host
 * @throws AppError 409 if there are unresolved bets on the table
 * @throws AppError 404 if the table does not exist
 */
export async function settleTable(
  tableId: string,
  requestingUserId: string,
): Promise<SettlementResult> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('settle_table', {
    p_table_id: tableId,
    p_user_id: requestingUserId,
  });

  if (error) {
    // Map PG error codes from the RPC to AppError status codes
    const msg = error.message ?? 'Settlement failed';

    if (msg.includes('Table not found')) {
      throw AppError.notFound('Table not found');
    }
    if (msg.includes('Only the table host')) {
      throw AppError.forbidden('Only the table host can settle the table');
    }
    if (msg.includes('still active or pending')) {
      throw AppError.conflict(msg);
    }

    logger.error({ tableId, error: msg }, 'settle_table RPC failed');
    throw AppError.internal('Settlement failed');
  }

  const result = data as {
    tableId: string;
    settledAt: string;
    memberCount: number;
    balances: MemberBalanceSnapshot[];
  };

  logger.info({ tableId, memberCount: result.memberCount }, 'table settled');

  return result;
}
