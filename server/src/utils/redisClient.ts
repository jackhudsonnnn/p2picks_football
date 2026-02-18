/**
 * Shared Redis Client
 *
 * Provides a shared Redis connection for use across the application.
 * Centralized here to avoid NFL-specific import paths.
 */

import Redis from 'ioredis';
import { env } from '../config/env';
import { createLogger } from './logger';

const logger = createLogger('redis');

/** Maximum reconnect attempts before giving up. */
const MAX_RECONNECT_RETRIES = 20;

/** Base delay for exponential backoff (ms). */
const BASE_RECONNECT_DELAY_MS = 500;

/** Hard cap on reconnect delay (ms). */
const MAX_RECONNECT_DELAY_MS = 30_000;

let sharedRedis: Redis | null = null;

function buildRedis(): Redis {
  // Validation handled by Zod schema in config/env.ts
  const client = new Redis(env.REDIS_URL, {
    retryStrategy(times: number): number | null {
      if (times > MAX_RECONNECT_RETRIES) {
        logger.error(
          { attempts: times },
          'max reconnect retries exceeded — giving up',
        );
        return null; // stop reconnecting
      }
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, times - 1),
        MAX_RECONNECT_DELAY_MS,
      );
      logger.warn({ attempt: times, delayMs: delay }, 'reconnecting…');
      return delay;
    },
    maxRetriesPerRequest: null, // let BullMQ manage its own retries
  });
  client.on('error', (err: unknown) => {
    logger.error({ error: err instanceof Error ? (err as Error).message : String(err) }, 'connection error');
  });
  logger.info({}, 'client initialized');
  return client;
}

/**
 * Get the shared Redis client instance.
 * Creates the connection on first call.
 */
export function getRedisClient(): Redis {
  if (sharedRedis) {
    return sharedRedis;
  }
  sharedRedis = buildRedis();
  return sharedRedis;
}

/**
 * Close the shared Redis connection.
 */
export function closeRedisClient(): void {
  if (!sharedRedis) return;
  sharedRedis.quit().catch((err: unknown) => {
    logger.error({ error: err instanceof Error ? (err as Error).message : String(err) }, 'quit error');
  });
  sharedRedis = null;
}
