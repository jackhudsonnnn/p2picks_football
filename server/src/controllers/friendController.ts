import type { Request, Response } from 'express';
import { getFriendRateLimiter } from '../infrastructure/rateLimiters';
import { setRateLimitHeaders } from '../middleware/rateLimitHeaders';
import { createLogger } from '../utils/logger';

const logger = createLogger('friendController');

type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'canceled';

const RATE_LIMIT_MESSAGE = 'Friend request rate limit exceeded. Please wait before adding more friends.';

function normalizeUsername(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '');
}

async function fetchUserMap(supabase: NonNullable<Request['supabase']>, userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds));
  if (!uniqueIds.length) return new Map<string, { user_id: string; username: string | null }>();
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username')
    .in('user_id', uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map((u) => [u.user_id, u as { user_id: string; username: string | null }]));
}

async function ensureFriendship(supabase: NonNullable<Request['supabase']>, userIdA: string, userIdB: string) {
  const { data: existing, error: existingError } = await supabase
    .from('friends')
    .select('user_id1, user_id2')
    .or(
      `and(user_id1.eq.${userIdA},user_id2.eq.${userIdB}),and(user_id1.eq.${userIdB},user_id2.eq.${userIdA})`,
    )
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { error: insertError } = await supabase.from('friends').insert([
    {
      user_id1: userIdA,
      user_id2: userIdB,
    },
  ]);
  if (insertError) throw insertError;
  return { user_id1: userIdA, user_id2: userIdB };
}

async function loadFriendRequest(
  supabase: NonNullable<Request['supabase']>,
  requestId: string,
): Promise<
  | {
      request_id: string;
      sender_user_id: string;
      receiver_user_id: string;
      status: FriendRequestStatus;
      created_at: string;
      responded_at: string | null;
    }
  | null
> {
  const { data, error } = await supabase
    .from('friend_requests')
    .select('request_id, sender_user_id, receiver_user_id, status, created_at, responded_at')
    .eq('request_id', requestId)
    .maybeSingle();

  if (error) throw error;
  return data as any;
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
    setRateLimitHeaders(res, rateResult);

    if (!rateResult.allowed) {
      res.status(429).json({ error: RATE_LIMIT_MESSAGE, retryAfter: rateResult.retryAfterSeconds });
      return;
    }

    const normalizedUsername = normalizeUsername(username);

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
      logger.error({ error: findError.message }, 'Failed to lookup username');
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

    // Already friends?
    const { data: existingRelation, error: relationError } = await supabase
      .from('friends')
      .select('user_id1, user_id2')
      .or(
        `and(user_id1.eq.${authUser.id},user_id2.eq.${targetUser.user_id}),and(user_id1.eq.${targetUser.user_id},user_id2.eq.${authUser.id})`,
      )
      .maybeSingle();

    if (relationError) {
      logger.error({ error: relationError.message }, 'Failed to verify existing friendship');
      res.status(500).json({ error: 'Unable to verify current friendship status' });
      return;
    }

    if (existingRelation) {
      res.status(409).json({ error: 'Already friends with this user' });
      return;
    }

    // Check for an existing pending request from current user to target
    const { data: existingOutgoing, error: existingOutgoingError } = await supabase
      .from('friend_requests')
      .select('request_id')
      .eq('sender_user_id', authUser.id)
      .eq('receiver_user_id', targetUser.user_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingOutgoingError) {
      logger.error({ error: existingOutgoingError.message }, 'Failed to verify existing outgoing request');
      res.status(500).json({ error: 'Unable to verify current request status' });
      return;
    }

    if (existingOutgoing) {
      res.status(409).json({ error: 'Friend request already sent to this user' });
      return;
    }

    // If target user already sent a pending request, auto-accept by flipping their request to accepted
    const { data: incomingRequest, error: incomingError } = await supabase
      .from('friend_requests')
      .select('request_id, sender_user_id, receiver_user_id, status')
      .eq('sender_user_id', targetUser.user_id)
      .eq('receiver_user_id', authUser.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (incomingError) {
      logger.error({ error: incomingError.message }, 'Failed to lookup incoming request');
      res.status(500).json({ error: 'Unable to verify incoming requests' });
      return;
    }

    if (incomingRequest) {
      const { error: acceptError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('request_id', incomingRequest.request_id);

      if (acceptError) {
        logger.error({ error: acceptError.message }, 'Failed to accept existing request');
        res.status(500).json({ error: 'Failed to accept existing request' });
        return;
      }

      try {
        await ensureFriendship(supabase, authUser.id, targetUser.user_id);
      } catch (friendErr) {
        logger.error({ error: (friendErr as Error)?.message }, 'Failed to finalize friendship');
        res.status(500).json({ error: 'Failed to finalize friendship' });
        return;
      }

      res.status(201).json({
        friend: {
          user_id: targetUser.user_id,
          username: targetUser.username,
        },
        status: 'accepted',
      });
      return;
    }

    const insertPayload = {
      sender_user_id: authUser.id,
      receiver_user_id: targetUser.user_id,
      status: 'pending' as FriendRequestStatus,
    };

    const { data: requestRow, error: insertError } = await supabase
      .from('friend_requests')
      .insert([insertPayload])
      .select('request_id, sender_user_id, receiver_user_id, status, created_at, responded_at')
      .single();

    if (insertError) {
      logger.error({ error: insertError.message }, 'Failed to create friend request');
      res.status(500).json({ error: 'Failed to create friend request' });
      return;
    }

    res.status(201).json({
      request: {
        ...requestRow,
        sender: { user_id: authUser.id, username: authUser.user_metadata?.username ?? null },
        receiver: { user_id: targetUser.user_id, username: targetUser.username },
      },
      status: 'pending',
    });
  } catch (err) {
    logger.error({ error: (err as Error)?.message }, 'Unexpected error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listFriendRequests(req: Request, res: Response): Promise<void> {
  try {
    const supabase = req.supabase;
    const authUser = req.authUser;
    if (!supabase || !authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { data, error } = await supabase
      .from('friend_requests')
      .select('request_id, sender_user_id, receiver_user_id, status, created_at, responded_at')
      .or(`sender_user_id.eq.${authUser.id},receiver_user_id.eq.${authUser.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to list friend requests');
      res.status(500).json({ error: 'Failed to load friend requests' });
      return;
    }

    const requests = data ?? [];
    const userIds: string[] = [];
    requests.forEach((r) => {
      userIds.push(r.sender_user_id, r.receiver_user_id);
    });

    const userMap = await fetchUserMap(supabase, userIds);

    res.json({
      requests: requests.map((r) => ({
        ...r,
        sender: userMap.get(r.sender_user_id) ?? { user_id: r.sender_user_id, username: null },
        receiver: userMap.get(r.receiver_user_id) ?? { user_id: r.receiver_user_id, username: null },
      })),
    });
  } catch (err) {
    logger.error({ error: (err as Error)?.message }, 'Unexpected error listing requests');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function respondToFriendRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const action = req.params.action as 'accept' | 'decline' | 'cancel';
  const requestId = req.params.requestId;

  try {
    const supabase = req.supabase;
    const authUser = req.authUser;
    if (!supabase || !authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const request = await loadFriendRequest(supabase, requestId);
    if (!request) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    const isSender = request.sender_user_id === authUser.id;
    const isReceiver = request.receiver_user_id === authUser.id;

    if (!isSender && !isReceiver) {
      res.status(403).json({ error: 'Not authorized to modify this request' });
      return;
    }

    if (request.status !== 'pending' && action !== 'cancel') {
      res.status(400).json({ error: 'Request is no longer pending' });
      return;
    }

    if (action === 'accept' && !isReceiver) {
      res.status(403).json({ error: 'Only the receiver can accept this request' });
      return;
    }
    if (action === 'decline' && !isReceiver) {
      res.status(403).json({ error: 'Only the receiver can decline this request' });
      return;
    }
    if (action === 'cancel' && !isSender) {
      res.status(403).json({ error: 'Only the sender can cancel this request' });
      return;
    }

    const status: FriendRequestStatus =
      action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'canceled';

    const { data: updated, error: updateError } = await supabase
      .from('friend_requests')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .select('request_id, sender_user_id, receiver_user_id, status, created_at, responded_at')
      .single();

    if (updateError) {
      logger.error({ error: updateError.message }, 'Failed to update friend request');
      res.status(500).json({ error: 'Failed to update friend request' });
      return;
    }

    if (status === 'accepted') {
      const otherUserId = authUser.id === request.sender_user_id ? request.receiver_user_id : request.sender_user_id;
      try {
        await ensureFriendship(supabase, authUser.id, otherUserId);
      } catch (friendErr) {
        logger.error({ error: (friendErr as Error)?.message }, 'Failed to finalize friendship after accept');
        res.status(500).json({ error: 'Failed to finalize friendship' });
        return;
      }
    }

    const userMap = await fetchUserMap(supabase, [request.sender_user_id, request.receiver_user_id]);

    res.json({
      request: {
        ...updated,
        sender: userMap.get(request.sender_user_id) ?? { user_id: request.sender_user_id, username: null },
        receiver: userMap.get(request.receiver_user_id) ?? { user_id: request.receiver_user_id, username: null },
      },
      status,
    });
  } catch (err) {
    logger.error({ error: (err as Error)?.message }, 'Unexpected error updating request');
    res.status(500).json({ error: 'Internal server error' });
  }
}
