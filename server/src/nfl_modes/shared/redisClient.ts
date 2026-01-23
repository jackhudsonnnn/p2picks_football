import Redis from 'ioredis';
import { REDIS_URL } from '../../constants/environment';

let sharedRedis: Redis | null = null;

function buildRedis(): Redis {
  if (!REDIS_URL) {
    throw new Error('[modes] REDIS_URL not configured; Redis is required for validator services');
  }
  const client = new Redis(REDIS_URL);
  client.on('error', (err: unknown) => {
    console.error('[modes] redis error', err);
  });
  console.log('[modes] redis client initialized');
  return client;
}

export function getRedisClient(): Redis {
  if (sharedRedis) {
    return sharedRedis;
  }
  sharedRedis = buildRedis();
  return sharedRedis;
}

export function closeRedisClient(): void {
  if (!sharedRedis) return;
  sharedRedis.quit().catch((err: unknown) => {
    console.error('[modes] redis quit error', err);
  });
  sharedRedis = null;
}
