/**
 * Shared Redis Client
 *
 * Provides a shared Redis connection for use across the application.
 * Centralized here to avoid NFL-specific import paths.
 */

import Redis from 'ioredis';
import { REDIS_URL } from '../constants/environment';

let sharedRedis: Redis | null = null;

function buildRedis(): Redis {
  if (!REDIS_URL) {
    throw new Error('[redis] REDIS_URL not configured; Redis is required');
  }
  const client = new Redis(REDIS_URL);
  client.on('error', (err: unknown) => {
    console.error('[redis] connection error', err);
  });
  console.log('[redis] client initialized');
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
    console.error('[redis] quit error', err);
  });
  sharedRedis = null;
}
