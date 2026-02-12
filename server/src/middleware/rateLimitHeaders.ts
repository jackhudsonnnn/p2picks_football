import type { Response } from 'express';

/**
 * Standard rate limit result interface.
 * This is the shape returned by rate limiter services.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  retryAfterSeconds: number | null;
}

/**
 * Sets standard rate limit headers on an HTTP response.
 *
 * Headers set:
 * - X-RateLimit-Remaining: Number of requests remaining in current window
 * - X-RateLimit-Reset: Seconds until the rate limit window resets
 * - Retry-After: Seconds to wait before retrying (only if rate limited)
 *
 * @param res - Express response object
 * @param result - Rate limit check result from limiter
 */
export function setRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetInSeconds.toString());
  if (result.retryAfterSeconds !== null) {
    res.setHeader('Retry-After', result.retryAfterSeconds.toString());
  }
}

/**
 * Checks if request was rate limited and sends 429 response if so.
 * Returns true if rate limited (caller should return early).
 *
 * @param res - Express response object
 * @param result - Rate limit check result
 * @param message - Optional custom message (default: 'Rate limit exceeded')
 * @returns true if rate limited and response was sent, false otherwise
 */
export function handleRateLimitExceeded(
  res: Response,
  result: RateLimitResult,
  message = 'Rate limit exceeded',
): boolean {
  setRateLimitHeaders(res, result);

  if (!result.allowed) {
    res.status(429).json({
      error: message,
      retryAfter: result.retryAfterSeconds,
    });
    return true;
  }

  return false;
}
