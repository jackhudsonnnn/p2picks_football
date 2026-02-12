/**
 * Centralized Rate Limiters
 *
 * Provides singleton rate limiter instances for different use cases.
 * Centralizes initialization to avoid duplicated lazy-init patterns
 * across controllers.
 *
 * Usage:
 *   import { getMessageRateLimiter, getFriendRateLimiter, getBetRateLimiter } from '../infrastructure/rateLimiters';
 *   const limiter = getMessageRateLimiter();
 *   const result = await limiter.check(userId);
 */

import { getRedisClient } from '../utils/redisClient';
import {
  createMessageRateLimiter,
  createFriendRateLimiter,
  createBetRateLimiter,
  type RateLimiter,
} from '../utils/rateLimiter';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instances
// ─────────────────────────────────────────────────────────────────────────────

let messageRateLimiter: RateLimiter | null = null;
let friendRateLimiter: RateLimiter | null = null;
let betRateLimiter: RateLimiter | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Accessor Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the message rate limiter instance.
 * Used for rate limiting chat messages per user per table.
 * Configuration: 20 messages per minute.
 */
export function getMessageRateLimiter(): RateLimiter {
  if (!messageRateLimiter) {
    const redis = getRedisClient();
    messageRateLimiter = createMessageRateLimiter(redis);
  }
  return messageRateLimiter;
}

/**
 * Get the friend rate limiter instance.
 * Used for rate limiting friend requests.
 * Configuration: 10 requests per minute.
 */
export function getFriendRateLimiter(): RateLimiter {
  if (!friendRateLimiter) {
    const redis = getRedisClient();
    friendRateLimiter = createFriendRateLimiter(redis);
  }
  return friendRateLimiter;
}

/**
 * Get the bet rate limiter instance.
 * Used for rate limiting bet proposals and participations.
 * Configuration: 30 bets per minute.
 */
export function getBetRateLimiter(): RateLimiter {
  if (!betRateLimiter) {
    const redis = getRedisClient();
    betRateLimiter = createBetRateLimiter(redis);
  }
  return betRateLimiter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization & Cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize all rate limiters eagerly.
 * Call during server startup to fail fast if Redis is unavailable.
 */
export function initializeRateLimiters(): void {
  getMessageRateLimiter();
  getFriendRateLimiter();
  getBetRateLimiter();
}

/**
 * Reset all rate limiter instances.
 * Useful for testing or graceful shutdown.
 */
export function resetRateLimiters(): void {
  messageRateLimiter = null;
  friendRateLimiter = null;
  betRateLimiter = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export types
// ─────────────────────────────────────────────────────────────────────────────

export type { RateLimiter };
