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

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Provides per-key rate limiting with configurable windows.
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
   * @param key - Unique identifier for the rate limit bucket (e.g., `user:${userId}:table:${tableId}`)
   * @returns Rate limit result with remaining count and reset time
   */
  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowStart = now - windowMs;
    const redisKey = `${this.config.keyPrefix}:${key}`;

    // Use a transaction to atomically:
    // 1. Remove expired entries
    // 2. Count current entries
    // 3. Add new entry if allowed
    const pipeline = this.redis.pipeline();
    
    // Remove entries older than the window
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count current entries in window
    pipeline.zcard(redisKey);
    
    const results = await pipeline.exec();
    if (!results) {
      // Redis error, fail open (allow the request)
      logger.warn({}, 'Pipeline returned null, failing open');
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetInSeconds: this.config.windowSeconds,
        retryAfterSeconds: null,
      };
    }

    const [, zcardResult] = results;
    const currentCount = (zcardResult?.[1] as number) ?? 0;

    if (currentCount >= this.config.maxRequests) {
      // Rate limited - find when the oldest entry expires
      const oldestEntries = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      let retryAfterSeconds = this.config.windowSeconds;
      
      if (oldestEntries.length >= 2) {
        const oldestTimestamp = parseInt(oldestEntries[1], 10);
        const expiresAt = oldestTimestamp + windowMs;
        retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
      }

      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: retryAfterSeconds,
        retryAfterSeconds,
      };
    }

    // Request allowed - add entry with current timestamp as score
    // Use timestamp + random suffix for uniqueness
    const entryId = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    await this.redis
      .pipeline()
      .zadd(redisKey, now, entryId)
      .expire(redisKey, this.config.windowSeconds + 1)
      .exec();

    return {
      allowed: true,
      remaining: this.config.maxRequests - currentCount - 1,
      resetInSeconds: this.config.windowSeconds,
      retryAfterSeconds: null,
    };
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
