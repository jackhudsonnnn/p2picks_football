/**
 * Tests for the table settlement service (RPC-based).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settleTable } from '../../../src/services/table/tableSettlementService';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockRpc = vi.fn();

vi.mock('../../../src/supabaseClient', () => ({
  getSupabaseAdmin: () => ({
    rpc: mockRpc,
  }),
}));

const HOST_USER = 'host-user-id';
const TABLE_ID = 'table-uuid-1';

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('settleTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('settles the table successfully via RPC and returns result', async () => {
    const rpcResult = {
      tableId: TABLE_ID,
      settledAt: '2024-01-01T00:00:00Z',
      memberCount: 2,
      balances: [
        { userId: HOST_USER, bustBalanceBefore: 10, pushBalanceBefore: 5.25, sweepBalanceBefore: 8 },
        { userId: 'other-user', bustBalanceBefore: 10, pushBalanceBefore: -5.25, sweepBalanceBefore: 8 },
      ],
    };
    mockRpc.mockResolvedValue({ data: rpcResult, error: null });

    const result = await settleTable(TABLE_ID, HOST_USER);

    expect(mockRpc).toHaveBeenCalledWith('settle_table', {
      p_table_id: TABLE_ID,
      p_user_id: HOST_USER,
    });
    expect(result.tableId).toBe(TABLE_ID);
    expect(result.memberCount).toBe(2);
    expect(result.balances).toHaveLength(2);
  });

  it('throws 404 when table does not exist', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Table not found' } });

    await expect(settleTable(TABLE_ID, HOST_USER)).rejects.toThrow('Table not found');
  });

  it('throws 403 when requester is not the host', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Only the table host can settle the table' } });

    await expect(settleTable(TABLE_ID, 'other-user')).rejects.toThrow('Only the table host');
  });

  it('throws 409 when there are active bets', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Cannot settle table: 3 bet(s) are still active or pending' } });

    await expect(settleTable(TABLE_ID, HOST_USER)).rejects.toThrow('3 bet(s) are still active');
  });
});
