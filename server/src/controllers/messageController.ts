import type { Request, Response } from 'express';
import { getMessageRateLimiter } from '../infrastructure/rateLimiters';
import {
  validateMessage,
  isValidUUID,
  validateTableMembership,
  MAX_MESSAGE_LENGTH,
} from '../utils/messageValidation';
import { setRateLimitHeaders } from '../middleware/rateLimitHeaders';
import {
  parseMessageCursor,
  buildMessageCursor,
  parsePageSize,
  normalizeTimestamp,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type MessageCursor,
} from '../utils/pagination';
import { createLogger } from '../utils/logger';

const logger = createLogger('messageController');

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
      logger.error({ error: insertError.message }, 'Insert error');
      res.status(500).json({ error: 'Failed to send message' });
      return;
    }

    res.status(201).json({
      success: true,
      messageId: textMsg.text_message_id,
      postedAt: textMsg.posted_at,
    });
  } catch (err) {
    logger.error({ error: (err as Error)?.message }, 'Unexpected error');
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
    logger.error({ error: (err as Error)?.message }, 'Rate limit status error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /tables/:tableId/messages
 *
 * Cursor-based pagination over messages (chat, system, bet proposals).
 * Query params:
 * - limit?: number (default 20, max 100)
 * - beforePostedAt?: ISO string
 * - beforeMessageId?: string
 * - afterPostedAt?: ISO string (optional; mutually exclusive with before*)
 * - afterMessageId?: string
 */
export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const { tableId } = req.params;
    if (!isValidUUID(tableId)) {
      res.status(400).json({ error: 'Invalid table ID' });
      return;
    }

    const user = req.authUser;
    const supabase = req.supabase;
    if (!user || !supabase) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Enforce membership via RLS; also keep a fast path check to avoid unnecessary queries
    const isMember = await validateTableMembership(supabase, tableId, user.id);
    if (!isMember) {
      res.status(403).json({ error: 'You are not a member of this table' });
      return;
    }

    const limit = parsePageSize(req.query.limit);

    const before = parseMessageCursor({ postedAt: req.query.beforePostedAt, messageId: req.query.beforeMessageId });
    const after = parseMessageCursor({ postedAt: req.query.afterPostedAt, messageId: req.query.afterMessageId });

    if (before && after) {
      res.status(400).json({ error: 'Use either before* or after*, not both' });
      return;
    }

    if ((req.query.beforePostedAt || req.query.beforeMessageId) && !before) {
      res.status(400).json({ error: 'Invalid before* cursor' });
      return;
    }

    if ((req.query.afterPostedAt || req.query.afterMessageId) && !after) {
      res.status(400).json({ error: 'Invalid after* cursor' });
      return;
    }

    let query = supabase
      .from('messages')
      .select(
        `
        message_id,
        table_id,
        message_type,
        posted_at,
        text_messages (
          text_message_id,
          table_id,
          user_id,
          message_text,
          posted_at,
          users:user_id (username)
        ),
        system_messages (
          system_message_id,
          table_id,
          message_text,
          generated_at
        ),
        bet_proposals (
          bet_id,
          table_id,
          proposer_user_id,
          league,
          league_game_id,
          mode_key,
          description,
          wager_amount,
          time_limit_seconds,
          proposal_time,
          bet_status,
          close_time,
          winning_choice,
          resolution_time,
          users:proposer_user_id (username)
        )
      `,
      )
      .eq('table_id', tableId)
  // Matches index: messages_table_posted_id_desc (table_id, posted_at DESC, message_id DESC)
  .order('posted_at', { ascending: false })
  .order('message_id', { ascending: false })
      .limit(limit + 1);

    if (before) {
      const postedAtIso = before.postedAt;
      query = query.or(
        `and(posted_at.lt.${postedAtIso}),and(posted_at.eq.${postedAtIso},message_id.lt.${before.messageId})`,
      );
    }

    if (after) {
      const postedAtIso = after.postedAt;
      query = query.or(
        `and(posted_at.gt.${postedAtIso}),and(posted_at.eq.${postedAtIso},message_id.gt.${after.messageId})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      logger.error({ error: error.message }, 'listMessages query error');
      res.status(500).json({ error: 'Failed to fetch messages' });
      return;
    }

    let rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    const normalized = rows.map((row) => ({
      ...row,
      posted_at: row.posted_at ?? row?.text_messages?.posted_at ?? row?.system_messages?.generated_at ?? null,
    }));

    // map to response DTO
    const messages = normalized
      .slice()
      .reverse() // oldest -> newest for UI friendliness
      .map((row) => {
        const timestamp = normalizeTimestamp(row.posted_at);
        if (row.message_type === 'chat') {
          const txt = row.text_messages;
          return {
            id: String(row.message_id),
            type: 'chat',
            senderUserId: txt?.user_id ?? '',
            senderUsername: txt?.users?.username ?? 'Unknown',
            text: txt?.message_text ?? '',
            timestamp,
            tableId: txt?.table_id ?? row.table_id,
          };
        }

        if (row.message_type === 'system') {
          const sys = row.system_messages;
          return {
            id: String(row.message_id),
            type: 'system',
            senderUserId: '',
            senderUsername: '',
            text: sys?.message_text ?? '',
            timestamp,
            tableId: sys?.table_id ?? row.table_id,
          };
        }

        if (row.message_type === 'bet_proposal') {
          const bet = row.bet_proposals;
          const description = typeof bet?.description === 'string' && bet.description.length ? bet.description : 'Bet';
          return {
            id: String(row.message_id),
            type: 'bet_proposal',
            senderUserId: bet?.proposer_user_id ?? '',
            senderUsername: bet?.users?.username ?? 'Unknown',
            text: '',
            timestamp,
            tableId: bet?.table_id ?? row.table_id,
            betProposalId: bet?.bet_id,
            betDetails: bet
              ? {
                  description,
                  wager_amount: bet.wager_amount,
                  time_limit_seconds: bet.time_limit_seconds,
                  bet_status: bet.bet_status,
                  close_time: bet.close_time,
                  winning_choice: bet.winning_choice,
                  resolution_time: bet.resolution_time,
                  mode_key: bet.mode_key,
                  league_game_id: bet.league_game_id,
                  league: bet.league,
                }
              : undefined,
          };
        }

        return null;
      })
      .filter(Boolean);

    res.json({
      messages,
      nextCursor: hasMore ? buildMessageCursor(normalized) : null,
      hasMore,
      serverTime: new Date().toISOString(),
      limit,
    });
  } catch (err) {
    logger.error({ error: (err as Error)?.message }, 'listMessages unexpected error');
    res.status(500).json({ error: 'Internal server error' });
  }
}
