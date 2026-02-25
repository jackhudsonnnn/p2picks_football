/**
 * Tests for the addTableMember and removeTableMember controller handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

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

const mockAdminFrom = vi.fn();

vi.mock('../../../src/supabaseClient', () => ({
  getSupabaseAdmin: () => ({
    from: mockAdminFrom,
  }),
}));

const mockIsHost = vi.fn();
const mockIsMember = vi.fn();
const mockFindById = vi.fn();
const mockFindUserById = vi.fn();

vi.mock('../../../src/repositories', () => ({
  TableRepository: vi.fn().mockImplementation(() => ({
    isHost: mockIsHost,
    isMember: mockIsMember,
    findById: mockFindById,
  })),
  UserRepository: vi.fn().mockImplementation(() => ({
    findById: mockFindUserById,
  })),
}));

const { addTableMember, removeTableMember } = await import('../../../src/controllers/tableController');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const HOST_ID = 'aaaaaaaa-0000-1000-8000-000000000001';
const MEMBER_ID = 'bbbbbbbb-0000-1000-8000-000000000002';
const TABLE_ID = 'cccccccc-0000-1000-8000-000000000003';

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    supabase: {} as any,
    authUser: { id: HOST_ID } as any,
    params: { tableId: TABLE_ID },
    body: { user_id: MEMBER_ID },
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

// ─────────────────────────────────────────────────────────────────────────────
// addTableMember
// ─────────────────────────────────────────────────────────────────────────────

describe('addTableMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsHost.mockResolvedValue(true);
    mockFindUserById.mockResolvedValue({ user_id: MEMBER_ID, username: 'alice', created_at: '2024-01-01' });
    mockIsMember.mockResolvedValue(false);
    mockAdminFrom.mockReturnValue({
      insert: () => ({ error: null }),
    });
  });

  it('adds a member successfully and returns 201', async () => {
    const req = makeReq();
    const { res, json, status } = makeRes();

    await addTableMember(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ table_id: TABLE_ID, user_id: MEMBER_ID, username: 'alice' }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ supabase: undefined, authUser: undefined });
    const { res, status } = makeRes();

    await addTableMember(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when caller is not the host', async () => {
    mockIsHost.mockResolvedValue(false);
    const req = makeReq();
    const { res, status, json } = makeRes();

    await addTableMember(req, res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('host') }));
  });

  it('returns 404 when target user does not exist', async () => {
    mockFindUserById.mockResolvedValue(null);
    const req = makeReq();
    const { res, status } = makeRes();

    await addTableMember(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when host tries to add themselves', async () => {
    const req = makeReq({ body: { user_id: HOST_ID } });
    const { res, status } = makeRes();

    await addTableMember(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 409 when user is already a member', async () => {
    mockIsMember.mockResolvedValue(true);
    const req = makeReq();
    const { res, status } = makeRes();

    await addTableMember(req, res);

    expect(status).toHaveBeenCalledWith(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeTableMember
// ─────────────────────────────────────────────────────────────────────────────

describe('removeTableMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue({ table_id: TABLE_ID, host_user_id: HOST_ID, table_name: 'Test' });
    mockIsMember.mockResolvedValue(true);
    mockAdminFrom.mockReturnValue({
      delete: () => ({
        eq: () => ({ eq: () => ({ error: null }) }),
      }),
    });
  });

  it('removes a member successfully (host removes other user)', async () => {
    const req = makeReq({ params: { tableId: TABLE_ID, userId: MEMBER_ID } });
    const { res, json } = makeRes();

    await removeTableMember(req, res);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ removed: true, table_id: TABLE_ID, user_id: MEMBER_ID }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ supabase: undefined, authUser: undefined, params: { tableId: TABLE_ID, userId: MEMBER_ID } });
    const { res, status } = makeRes();

    await removeTableMember(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 404 when table does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = makeReq({ params: { tableId: TABLE_ID, userId: MEMBER_ID } });
    const { res, status } = makeRes();

    await removeTableMember(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when caller is neither host nor self', async () => {
    const req = makeReq({
      authUser: { id: 'dddddddd-0000-1000-8000-000000000004' },
      params: { tableId: TABLE_ID, userId: MEMBER_ID },
    });
    const { res, status } = makeRes();

    await removeTableMember(req, res);

    expect(status).toHaveBeenCalledWith(403);
  });

  it('returns 400 when host tries to remove themselves', async () => {
    const req = makeReq({ params: { tableId: TABLE_ID, userId: HOST_ID } });
    const { res, status, json } = makeRes();

    await removeTableMember(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('host') }));
  });

  it('returns 404 when target user is not a member', async () => {
    mockIsMember.mockResolvedValue(false);
    const req = makeReq({ params: { tableId: TABLE_ID, userId: MEMBER_ID } });
    const { res, status } = makeRes();

    await removeTableMember(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });
});
