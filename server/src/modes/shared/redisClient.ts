import Redis from 'ioredis';

let sharedRedis: Redis | null = null;

function buildRedis(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('[modes] REDIS_URL not configured; Redis is required for validator services');
  }
  const client = new Redis(url);
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
