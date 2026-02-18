import type Redis from 'ioredis';
import { createLogger } from './logger';

const logger = createLogger('RateLimiter');

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Optional key prefix for namespacing */
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  retryAfterSeconds: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lua script — executed atomically inside Redis
//
// KEYS[1] = the sorted-set key
// ARGV[1] = window start timestamp (ms)
// ARGV[2] = current timestamp (ms)
// ARGV[3] = maxRequests
// ARGV[4] = TTL seconds for the key
// ARGV[5] = unique entry id (timestamp:random)
//
// Returns { allowed (0|1), currentCount, oldestScore }
// ─────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_LUA = `
local key         = KEYS[1]
local windowStart = tonumber(ARGV[1])
local now         = tonumber(ARGV[2])
local maxReqs     = tonumber(ARGV[3])
local ttl         = tonumber(ARGV[4])
local entryId     = ARGV[5]

-- 1. Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

-- 2. Count current entries
local count = redis.call('ZCARD', key)

if count >= maxReqs then
  -- Over limit — find the oldest entry's score for retry-after calculation
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = 0
  if oldest and #oldest >= 2 then
    oldestScore = tonumber(oldest[2])
  end
  return {0, count, oldestScore}
end

-- 3. Under limit — add the entry and set expiry
redis.call('ZADD', key, now, entryId)
redis.call('EXPIRE', key, ttl)

return {1, count + 1, 0}
`;

/**
 * Sliding window rate limiter using Redis sorted sets.
 *
 * The `check()` method is fully atomic — a single Lua script performs
 * cleanup, count, and insertion in one round-trip, preventing the race
 * where concurrent requests can all read "under limit" before any of
 * them records its entry.
 */
export class RateLimiter {
  private redis: Redis;
  private config: Required<RateLimitConfig>;

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = {
      maxRequests: config.maxRequests,
      windowSeconds: config.windowSeconds,
      keyPrefix: config.keyPrefix ?? 'ratelimit',
    };
  }

  /**
   * Check if a request is allowed and record it if so.
   * Fully atomic via a Redis Lua script.
   */
  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowStart = now - windowMs;
    const redisKey = `${this.config.keyPrefix}:${key}`;
    const entryId = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    const ttl = this.config.windowSeconds + 1;

    try {
      const result = await this.redis.eval(
        RATE_LIMIT_LUA,
        1,
        redisKey,
        String(windowStart),
        String(now),
        String(this.config.maxRequests),
        String(ttl),
        entryId,
      ) as [number, number, number];

      const [allowed, currentCount, oldestScore] = result;

      if (allowed) {
        return {
          allowed: true,
          remaining: this.config.maxRequests - currentCount,
          resetInSeconds: this.config.windowSeconds,
          retryAfterSeconds: null,
        };
      }

      // Rate limited
      let retryAfterSeconds = this.config.windowSeconds;
      if (oldestScore > 0) {
        const expiresAt = oldestScore + windowMs;
        retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
      }

      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: retryAfterSeconds,
        retryAfterSeconds,
      };
    } catch (err) {
      // Redis error — fail open (allow the request)
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Lua eval failed, failing open');
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetInSeconds: this.config.windowSeconds,
        retryAfterSeconds: null,
      };
    }
  }

  /**
   * Get current rate limit status without recording a request.
   */
  async status(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowStart = now - windowMs;
    const redisKey = `${this.config.keyPrefix}:${key}`;

    // Clean up and count
    await this.redis.zremrangebyscore(redisKey, 0, windowStart);
    const currentCount = await this.redis.zcard(redisKey);

    const remaining = Math.max(0, this.config.maxRequests - currentCount);
    const allowed = remaining > 0;

    let retryAfterSeconds: number | null = null;
    if (!allowed) {
      const oldestEntries = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      if (oldestEntries.length >= 2) {
        const oldestTimestamp = parseInt(oldestEntries[1], 10);
        const expiresAt = oldestTimestamp + windowMs;
        retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
      } else {
        retryAfterSeconds = this.config.windowSeconds;
      }
    }

    return {
      allowed,
      remaining,
      resetInSeconds: this.config.windowSeconds,
      retryAfterSeconds,
    };
  }

  /**
   * Reset the rate limit for a specific key.
   */
  async reset(key: string): Promise<void> {
    const redisKey = `${this.config.keyPrefix}:${key}`;
    await this.redis.del(redisKey);
  }
}

/**
 * Create a rate limiter for message sending.
 * Default: 20 messages per 60 seconds per user per table.
 */
export function createMessageRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis, {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:messages',
  });
}

/**
 * Create a rate limiter for bet proposals.
 * Default: 5 bets per 60 seconds per user per table.
 */
export function createBetRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis, {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:bets',
  });
}

/**
 * Create a rate limiter for friend additions.
 * Default: 10 friend adds per 60 seconds per user.
 */
export function createFriendRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis, {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:friends',
  });
}
