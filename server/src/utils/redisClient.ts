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

let sharedRedis: Redis | null = null;

function buildRedis(): Redis {
  // Validation handled by Zod schema in config/env.ts
  const client = new Redis(env.REDIS_URL);
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
