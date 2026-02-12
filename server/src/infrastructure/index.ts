/**
 * Infrastructure Module
 *
 * Exports centralized infrastructure utilities:
 * - Rate limiters (singleton instances)
 * - Health checks (dependency monitoring)
 */

// Rate Limiters
export {
  getMessageRateLimiter,
  getFriendRateLimiter,
  getBetRateLimiter,
  initializeRateLimiters,
  resetRateLimiters,
  type RateLimiter,
} from './rateLimiters';

// Health Checks
export {
  checkRedisHealth,
  checkSupabaseHealth,
  getHealthStatus,
  type HealthCheckResult,
  type HealthStatus,
} from './healthCheck';
