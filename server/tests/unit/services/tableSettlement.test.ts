/**
 * Tests for the table settlement service.
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

const HOST_USER = 'host-user-id';
const OTHER_USER = 'other-user-id';
const TABLE_ID = 'table-uuid-1';

function buildSupabase(overrides: Record<string, any> = {}) {
  const defaults = {
    findByIdResult: { table_id: TABLE_ID, table_name: 'Test', host_user_id: HOST_USER, created_at: '2024-01-01', last_activity_at: '2024-01-01' },
    activeBetCount: 0,
    activeBetError: null,
    members: [
      { user_id: HOST_USER, balance: 5.25 },
      { user_id: OTHER_USER, balance: -5.25 },
    ],
    membersError: null,
    zeroError: null,
    insertSettlementError: null,
  };
  const cfg = { ...defaults, ...overrides };

  return {
    from: vi.fn((table: string) => {
      if (table === 'tables') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: cfg.findByIdResult, error: null }),
            }),
          }),
        };
      }
      if (table === 'bet_proposals') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: cfg.activeBetCount, error: cfg.activeBetError }),
            }),
          }),
        };
      }
      if (table === 'table_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: cfg.members, error: cfg.membersError }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: cfg.zeroError }),
          }),
        };
      }
      if (table === 'table_settlements') {
        return {
          insert: vi.fn().mockResolvedValue({ error: cfg.insertSettlementError }),
        };
      }
      return {};
    }),
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('settleTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('settles the table successfully and returns balance snapshots', async () => {
    const supabase = buildSupabase();
    const result = await settleTable(TABLE_ID, HOST_USER, supabase);

    expect(result.tableId).toBe(TABLE_ID);
    expect(result.memberCount).toBe(2);
    expect(result.balances).toEqual([
      { userId: HOST_USER, balanceBefore: 5.25 },
      { userId: OTHER_USER, balanceBefore: -5.25 },
    ]);
    expect(result.settledAt).toBeDefined();
  });

  it('throws 404 when table does not exist', async () => {
    const supabase = buildSupabase({ findByIdResult: null });

    await expect(settleTable(TABLE_ID, HOST_USER, supabase)).rejects.toThrow('Table not found');
  });

  it('throws 403 when requester is not the host', async () => {
    const supabase = buildSupabase();

    await expect(settleTable(TABLE_ID, OTHER_USER, supabase)).rejects.toThrow('Only the table host');
  });

  it('throws 409 when there are active bets', async () => {
    const supabase = buildSupabase({ activeBetCount: 3 });

    await expect(settleTable(TABLE_ID, HOST_USER, supabase)).rejects.toThrow('3 bet(s) are still active');
  });
});
