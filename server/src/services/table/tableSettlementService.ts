/**
 * Table Settlement Service
 *
 * Handles the "settle" workflow for a betting table:
 *
 * 1. Only the table host may initiate settlement.
 * 2. All active (non-resolved, non-washed) bets on the table must be
 *    resolved before settlement can proceed.
 * 3. Settlement zeroes every member's running balance and records a
 *    settlement event in `table_settlements` for auditability.
 * 4. After settlement the table remains open for future bets.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TableRepository } from '../../repositories/TableRepository';
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
  balanceBefore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Settle a table — zero all member balances and record the event.
 *
 * @throws AppError 403 if the requesting user is not the host
 * @throws AppError 409 if there are unresolved bets on the table
 * @throws AppError 404 if the table does not exist
 */
export async function settleTable(
  tableId: string,
  requestingUserId: string,
  supabase: SupabaseClient,
): Promise<SettlementResult> {
  const tableRepo = new TableRepository(supabase);

  // 1. Verify table exists
  const table = await tableRepo.findById(tableId);
  if (!table) {
    throw AppError.notFound('Table not found');
  }

  // 2. Only the host may settle
  if (table.host_user_id !== requestingUserId) {
    throw AppError.forbidden('Only the table host can settle the table');
  }

  // 3. Ensure no active (unresolved) bets remain
  const { count: activeBetCount, error: countErr } = await supabase
    .from('bet_proposals')
    .select('*', { count: 'exact', head: true })
    .eq('table_id', tableId)
    .in('bet_status', ['active', 'pending']);

  if (countErr) {
    logger.error({ tableId, error: countErr.message }, 'failed to count active bets');
    throw AppError.internal('Unable to verify bet status');
  }

  if (activeBetCount && activeBetCount > 0) {
    throw AppError.conflict(
      `Cannot settle table: ${activeBetCount} bet(s) are still active or pending`,
      { activeBetCount },
    );
  }

  // 4. Snapshot current member balances
  const { data: members, error: membersErr } = await supabase
    .from('table_members')
    .select('user_id, balance')
    .eq('table_id', tableId);

  if (membersErr) {
    logger.error({ tableId, error: membersErr.message }, 'failed to fetch members');
    throw AppError.internal('Unable to fetch table members');
  }

  const balances: MemberBalanceSnapshot[] = (members ?? []).map((m: any) => ({
    userId: m.user_id,
    balanceBefore: Number(m.balance ?? 0),
  }));

  // 5. Zero all balances
  const { error: zeroErr } = await supabase
    .from('table_members')
    .update({ balance: 0 })
    .eq('table_id', tableId);

  if (zeroErr) {
    logger.error({ tableId, error: zeroErr.message }, 'failed to zero balances');
    throw AppError.internal('Settlement failed while zeroing balances');
  }

  // 6. Record settlement event
  const settledAt = new Date().toISOString();
  const { error: insertErr } = await supabase
    .from('table_settlements')
    .insert({
      table_id: tableId,
      settled_by: requestingUserId,
      settled_at: settledAt,
      balance_snapshot: balances,
    });

  if (insertErr) {
    // Non-fatal — the balances are already zeroed. Log and continue.
    logger.error({ tableId, error: insertErr.message }, 'failed to record settlement event (balances already zeroed)');
  }

  logger.info({ tableId, memberCount: balances.length }, 'table settled');

  return {
    tableId,
    settledAt,
    memberCount: balances.length,
    balances,
  };
}
