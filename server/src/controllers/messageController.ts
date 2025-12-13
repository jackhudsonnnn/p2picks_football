import type { Request, Response } from 'express';
import { getRedisClient } from '../modes/shared/redisClient';
import { createMessageRateLimiter, type RateLimitResult } from '../utils/rateLimiter';
import {
  validateMessage,
  isValidUUID,
  validateTableMembership,
  MAX_MESSAGE_LENGTH,
} from '../utils/messageValidation';

// Lazy-initialize the rate limiter
let messageRateLimiter: ReturnType<typeof createMessageRateLimiter> | null = null;

function getMessageRateLimiter() {
  if (!messageRateLimiter) {
    const redis = getRedisClient();
    messageRateLimiter = createMessageRateLimiter(redis);
  }
  return messageRateLimiter;
}

/**
 * Helper to set rate limit headers on the response.
 */
function setRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetInSeconds.toString());
  if (result.retryAfterSeconds !== null) {
    res.setHeader('Retry-After', result.retryAfterSeconds.toString());
  }
}

/**
 * POST /tables/:tableId/messages
 * 
 * Send a text message to a table's chat.
 * Requires authentication and table membership.
 * Rate limited to 20 messages per minute per user per table.
 * 
 * Request body:
 * {
 *   "message": "Hello world"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "messageId": "uuid",
 *   "postedAt": "ISO timestamp"
 * }
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const { tableId } = req.params;
    const { message } = req.body;

    // Validate tableId
    if (!isValidUUID(tableId)) {
      res.status(400).json({ error: 'Invalid table ID' });
      return;
    }

    // Get authenticated user
    const user = req.authUser;
    const supabase = req.supabase;

    if (!user || !supabase) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userId = user.id;

    // Validate message content
    const validation = validateMessage(message);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
        maxLength: MAX_MESSAGE_LENGTH,
      });
      return;
    }

    // Check table membership
    const isMember = await validateTableMembership(supabase, tableId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'You are not a member of this table' });
      return;
    }

    // Check rate limit
    const rateLimiter = getMessageRateLimiter();
    const rateLimitKey = `${userId}:${tableId}`;
    const rateLimitResult = await rateLimiter.check(rateLimitKey);

    setRateLimitHeaders(res, rateLimitResult);

    if (!rateLimitResult.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfterSeconds,
        message: `You can send up to 20 messages per minute. Please wait ${rateLimitResult.retryAfterSeconds} seconds.`,
      });
      return;
    }

    // Insert the message
    const { data: textMsg, error: insertError } = await supabase
      .from('text_messages')
      .insert([
        {
          table_id: tableId,
          user_id: userId,
          message_text: validation.sanitized,
        },
      ])
      .select('text_message_id, posted_at')
      .single();

    if (insertError) {
      console.error('[messageController] Insert error:', insertError);
      res.status(500).json({ error: 'Failed to send message' });
      return;
    }

    res.status(201).json({
      success: true,
      messageId: textMsg.text_message_id,
      postedAt: textMsg.posted_at,
    });
  } catch (err) {
    console.error('[messageController] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /tables/:tableId/messages/rate-limit-status
 * 
 * Get the current rate limit status without consuming a request.
 * Useful for UI to show remaining messages.
 */
export async function getRateLimitStatus(req: Request, res: Response): Promise<void> {
  try {
    const { tableId } = req.params;

    if (!isValidUUID(tableId)) {
      res.status(400).json({ error: 'Invalid table ID' });
      return;
    }

    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const rateLimiter = getMessageRateLimiter();
    const rateLimitKey = `${user.id}:${tableId}`;
    const status = await rateLimiter.status(rateLimitKey);

    setRateLimitHeaders(res, status);

    res.json({
      remaining: status.remaining,
      resetInSeconds: status.resetInSeconds,
      allowed: status.allowed,
    });
  } catch (err) {
    console.error('[messageController] Rate limit status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
