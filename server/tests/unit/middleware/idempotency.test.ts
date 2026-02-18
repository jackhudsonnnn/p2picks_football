/**
 * Tests for the idempotency middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { idempotency, IDEMPOTENCY_HEADER } from '../../../src/middleware/idempotency';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Redis
// ─────────────────────────────────────────────────────────────────────────────

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
};

vi.mock('../../../src/utils/redisClient', () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response & { _statusCode: number; _body: unknown } {
  const res: any = { _statusCode: 200, _body: undefined };
  res.status = vi.fn((code: number) => {
    res._statusCode = code;
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res._body = body;
    return res;
  });
  res.statusCode = 200;
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('idempotency middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls next() when no Idempotency-Key header is present', async () => {
    const middleware = idempotency();
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('calls next() and acquires the key on first request', async () => {
    mockRedis.set.mockResolvedValue('OK'); // NX succeeded

    const middleware = idempotency();
    const req = mockReq({ [IDEMPOTENCY_HEADER]: 'unique-key-1' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'idempotency:unique-key-1',
      '__processing__',
      'EX',
      86400,
      'NX',
    );
  });

  it('returns cached response when the key already has a completed result', async () => {
    const cached = JSON.stringify({ statusCode: 201, body: { id: 'bet-123' } });
    mockRedis.set.mockResolvedValue(null); // NX failed — key exists
    mockRedis.get.mockResolvedValue(cached);

    const middleware = idempotency();
    const req = mockReq({ [IDEMPOTENCY_HEADER]: 'dup-key' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'bet-123' });
  });

  it('returns 409 when the key is still processing', async () => {
    mockRedis.set.mockResolvedValue(null); // NX failed
    mockRedis.get.mockResolvedValue('__processing__');

    const middleware = idempotency();
    const req = mockReq({ [IDEMPOTENCY_HEADER]: 'concurrent-key' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res._body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('persists the response after the handler writes via res.json', async () => {
    mockRedis.set
      .mockResolvedValueOnce('OK')   // NX succeeded (acquire)
      .mockResolvedValueOnce('OK');  // persist response

    const middleware = idempotency({ ttlSeconds: 3600 });
    const req = mockReq({ [IDEMPOTENCY_HEADER]: 'persist-key' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    // Simulate handler setting status + calling json
    res.statusCode = 201;
    res.json({ bet: 'created' });

    // Wait for the fire-and-forget persist
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRedis.set).toHaveBeenCalledTimes(2);
    const persistCall = mockRedis.set.mock.calls[1];
    expect(persistCall[0]).toBe('idempotency:persist-key');
    const parsed = JSON.parse(persistCall[1] as string);
    expect(parsed.statusCode).toBe(201);
    expect(parsed.body).toEqual({ bet: 'created' });
    expect(persistCall[3]).toBe(3600); // custom TTL
  });

  it('falls through when Redis throws during SET NX', async () => {
    mockRedis.set.mockRejectedValue(new Error('Redis down'));

    const middleware = idempotency();
    const req = mockReq({ [IDEMPOTENCY_HEADER]: 'fail-key' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() when the key expired between SET NX and GET', async () => {
    mockRedis.set.mockResolvedValue(null); // NX failed
    mockRedis.get.mockResolvedValue(null); // expired

    const middleware = idempotency();
    const req = mockReq({ [IDEMPOTENCY_HEADER]: 'expired-key' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('ignores empty Idempotency-Key header', async () => {
    const middleware = idempotency();
    const req = mockReq({ [IDEMPOTENCY_HEADER]: '   ' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
