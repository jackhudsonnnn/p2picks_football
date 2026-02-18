/**
 * Tests for validateBody and validateParams middleware
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validateBody, validateParams } from '../../../src/middleware/validateRequest';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, ...overrides } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });

  it('passes valid body to next and replaces req.body with parsed data', () => {
    const req = mockReq({ body: { name: 'Alice', age: 25 } });
    const res = mockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Alice', age: 25 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with validation errors on invalid body', () => {
    const req = mockReq({ body: { name: '', age: -1 } });
    const res = mockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: expect.any(String) }),
        ]),
      }),
    );
  });

  it('returns 400 when body is missing entirely', () => {
    const req = mockReq({ body: undefined });
    const res = mockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('applies defaults and coercion from schema', () => {
    const withDefaults = z.object({
      color: z.string().default('blue'),
    });
    const req = mockReq({ body: {} });
    const res = mockRes();
    const next = vi.fn();

    validateBody(withDefaults)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ color: 'blue' });
  });
});

describe('validateParams', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const schema = z.object({
    betId: z.string().regex(UUID_REGEX, 'Must be a valid UUID'),
  });

  it('passes valid params and calls next', () => {
    const req = mockReq({ params: { betId: '550e8400-e29b-41d4-a716-446655440000' } as any });
    const res = mockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed UUID', () => {
    const req = mockReq({ params: { betId: 'not-a-uuid' } as any });
    const res = mockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid path parameters',
        code: 'VALIDATION_ERROR',
      }),
    );
  });

  it('returns 400 when param is missing', () => {
    const req = mockReq({ params: {} as any });
    const res = mockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects SQL injection in UUID param', () => {
    const req = mockReq({ params: { betId: '550e8400-e29b-41d4-a716-446655440000;DROP TABLE bets;' } as any });
    const res = mockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
