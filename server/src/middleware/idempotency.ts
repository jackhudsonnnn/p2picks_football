/**
 * Idempotency Key Middleware
 *
 * Ensures that repeated POST requests with the same Idempotency-Key header
 * return the cached response from the first execution rather than creating
 * duplicate resources.
 *
 * Storage: Redis with a configurable TTL (default 24 h).
 *
 * Flow:
 * 1. If the request has no Idempotency-Key header, skip (pass through).
 * 2. Try to SET NX a Redis key. If the key already exists:
 *    a. If the stored value is a "processing" sentinel, return 409 (concurrent).
 *    b. Otherwise return the cached response (status + body).
 * 3. If SET NX succeeds (first time), store a processing sentinel,
 *    monkey-patch `res.json` to capture the response, then call next().
 * 4. After the handler writes a response, persist the real payload in Redis.
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../utils/redisClient';
import { createLogger } from '../utils/logger';

const logger = createLogger('idempotency');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** Redis key prefix. */
const REDIS_PREFIX = 'idempotency';

/** Default TTL — 24 hours. */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

/** Sentinel value written while the first request is still in-flight. */
const PROCESSING_SENTINEL = '__processing__';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware factory
// ─────────────────────────────────────────────────────────────────────────────

export interface IdempotencyOptions {
  /** TTL in seconds for the cached response (default 86 400 = 24 h). */
  ttlSeconds?: number;
}

/**
 * Express middleware that enforces idempotency on a route.
 *
 * Usage:
 * ```
 * router.post('/resource', idempotency(), handler);
 * ```
 */
export function idempotency(opts: IdempotencyOptions = {}) {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.headers[IDEMPOTENCY_HEADER];
    if (!key || typeof key !== 'string' || !key.trim()) {
      // No idempotency header — behave normally
      next();
      return;
    }

    const redisKey = `${REDIS_PREFIX}:${key.trim()}`;

    try {
      const redis = getRedisClient();

      // Try to acquire the key with SET NX
      const acquired = await redis.set(redisKey, PROCESSING_SENTINEL, 'EX', ttl, 'NX');

      if (!acquired) {
        // Key already exists — either processing or completed
        const stored = await redis.get(redisKey);

        if (!stored) {
          // Expired between SET NX and GET (very unlikely). Treat as new.
          next();
          return;
        }

        if (stored === PROCESSING_SENTINEL) {
          res.status(409).json({
            error: 'A request with this idempotency key is already being processed',
            code: 'IDEMPOTENCY_CONFLICT',
          });
          return;
        }

        // Return the cached response
        const cached: CachedResponse = JSON.parse(stored);
        logger.info({ idempotencyKey: key.trim() }, 'returning cached idempotent response');
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      // First time — intercept `res.json` to capture the response
      const originalJson = res.json.bind(res);

      res.json = function captureJson(body?: unknown): Response {
        // Persist the actual response in Redis (fire-and-forget)
        const cached: CachedResponse = {
          statusCode: res.statusCode,
          body,
        };
        redis
          .set(redisKey, JSON.stringify(cached), 'EX', ttl)
          .catch((err) => {
            logger.error(
              { idempotencyKey: key, error: err instanceof Error ? err.message : String(err) },
              'failed to persist idempotent response',
            );
          });

        return originalJson(body);
      };

      next();
    } catch (err) {
      // Redis failure — don't block the request, just skip idempotency
      logger.error(
        { idempotencyKey: key, error: err instanceof Error ? err.message : String(err) },
        'idempotency middleware Redis error — falling through',
      );
      next();
    }
  };
}
