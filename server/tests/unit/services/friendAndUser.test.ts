/**
 * Tests for the removeFriend controller handler and updateUsername controller.
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

const mockUserSupabaseFrom = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('../../../src/supabaseClient', () => ({
  getSupabaseAdmin: () => ({
    from: mockAdminFrom,
  }),
}));

const { removeFriend } = await import('../../../src/controllers/friendController');
const { updateUsername } = await import('../../../src/controllers/userController');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_USER_ID = 'aaaaaaaa-0000-1000-8000-000000000001';
const FRIEND_USER_ID = 'bbbbbbbb-0000-1000-8000-000000000002';

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    supabase: { from: mockUserSupabaseFrom } as any,
    authUser: { id: AUTH_USER_ID } as any,
    params: { friendUserId: FRIEND_USER_ID },
    body: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

// ─────────────────────────────────────────────────────────────────────────────
// removeFriend
// ─────────────────────────────────────────────────────────────────────────────

describe('removeFriend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: friendship exists; delete succeeds
    mockUserSupabaseFrom.mockReturnValue({
      select: () => ({
        or: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id1: AUTH_USER_ID, user_id2: FRIEND_USER_ID }, error: null }) }),
      }),
    });
    mockAdminFrom.mockReturnValue({
      delete: () => ({
        or: () => Promise.resolve({ error: null }),
      }),
    });
  });

  it('removes friend successfully and returns 200', async () => {
    const req = makeReq();
    const { res, json } = makeRes();

    await removeFriend(req, res);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ removed: true, friend_user_id: FRIEND_USER_ID }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ supabase: undefined, authUser: undefined });
    const { res, status } = makeRes();

    await removeFriend(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when user tries to remove themselves', async () => {
    const req = makeReq({ params: { friendUserId: AUTH_USER_ID } });
    const { res, status } = makeRes();

    await removeFriend(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when friendship does not exist', async () => {
    mockUserSupabaseFrom.mockReturnValue({
      select: () => ({
        or: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    });
    const req = makeReq();
    const { res, status } = makeRes();

    await removeFriend(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateUsername
// ─────────────────────────────────────────────────────────────────────────────

describe('updateUsername', () => {
  const USERNAME = 'alice_new';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: username not taken; update succeeds
    // maybeSingle call (uniqueness check)
    // single call (update + select)
    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // uniqueness check: no existing user
        return {
          select: () => ({
            ilike: () => ({
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        };
      }
      // update
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { user_id: AUTH_USER_ID, username: USERNAME, email: 'a@b.com', updated_at: '2024-01-01' },
                  error: null,
                }),
            }),
          }),
        }),
      };
    });
  });

  it('updates username successfully and returns 200 with profile', async () => {
    const req = makeReq({ body: { username: USERNAME } });
    const { res, json } = makeRes();

    await updateUsername(req, res);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ username: USERNAME }));
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ supabase: undefined, authUser: undefined, body: { username: USERNAME } });
    const { res, status } = makeRes();

    await updateUsername(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 409 when username is already taken', async () => {
    mockAdminFrom.mockReturnValue({
      select: () => ({
        ilike: () => ({
          neq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { user_id: 'some-other-user' }, error: null }),
          }),
        }),
      }),
    });
    const req = makeReq({ body: { username: USERNAME } });
    const { res, status, json } = makeRes();

    await updateUsername(req, res);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('taken') }));
  });
});
