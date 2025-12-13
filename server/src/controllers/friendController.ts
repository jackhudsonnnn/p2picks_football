import type { Request, Response } from 'express';
import { getRedisClient } from '../modes/shared/redisClient';
import { createFriendRateLimiter, type RateLimitResult } from '../utils/rateLimiter';

const RATE_LIMIT_MESSAGE = 'Friend request rate limit exceeded. Please wait before adding more friends.';

let friendRateLimiter: ReturnType<typeof createFriendRateLimiter> | null = null;

function getFriendRateLimiter() {
  if (!friendRateLimiter) {
    const redis = getRedisClient();
    friendRateLimiter = createFriendRateLimiter(redis);
  }
  return friendRateLimiter;
}

function applyRateLimitHeaders(res: Response, result: RateLimitResult) {
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetInSeconds.toString());
  if (result.retryAfterSeconds !== null) {
    res.setHeader('Retry-After', result.retryAfterSeconds.toString());
  }
}

export async function addFriend(req: Request, res: Response): Promise<void> {
  try {
    const supabase = req.supabase;
    const authUser = req.authUser;
    if (!supabase || !authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!username) {
      res.status(400).json({ error: 'username is required' });
      return;
    }

    // Apply rate limit
    const limiter = getFriendRateLimiter();
    const rateKey = authUser.id;
    const rateResult = await limiter.check(rateKey);
    applyRateLimitHeaders(res, rateResult);

    if (!rateResult.allowed) {
      res.status(429).json({ error: RATE_LIMIT_MESSAGE, retryAfter: rateResult.retryAfterSeconds });
      return;
    }

    const normalizedUsername = username.replace(/[^a-zA-Z0-9_]/g, '');

    if (!normalizedUsername) {
      res.status(400).json({ error: 'username must contain letters, numbers, or underscores' });
      return;
    }

    const { data: targetUser, error: findError } = await supabase
      .from('users')
      .select('user_id, username')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (findError) {
      console.error('[friendController] Failed to lookup username', findError);
      res.status(500).json({ error: 'Unable to lookup user' });
      return;
    }

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.user_id === authUser.id) {
      res.status(400).json({ error: 'You cannot add yourself as a friend' });
      return;
    }

    const { data: existingRelation, error: relationError } = await supabase
      .from('friends')
      .select('user_id1, user_id2')
      .or(
        `and(user_id1.eq.${authUser.id},user_id2.eq.${targetUser.user_id}),and(user_id1.eq.${targetUser.user_id},user_id2.eq.${authUser.id})`,
      )
      .maybeSingle();

    if (relationError) {
      console.error('[friendController] Failed to verify existing friendship', relationError);
      res.status(500).json({ error: 'Unable to verify current friendship status' });
      return;
    }

    if (existingRelation) {
      res.status(409).json({ error: 'Already friends with this user' });
      return;
    }

    const { error: insertError } = await supabase.from('friends').insert([
      {
        user_id1: authUser.id,
        user_id2: targetUser.user_id,
      },
    ]);

    if (insertError) {
      console.error('[friendController] Failed to add friend', insertError);
      res.status(500).json({ error: 'Failed to add friend' });
      return;
    }

    res.status(201).json({
      friend: {
        user_id: targetUser.user_id,
        username: targetUser.username,
      },
    });
  } catch (err) {
    console.error('[friendController] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
