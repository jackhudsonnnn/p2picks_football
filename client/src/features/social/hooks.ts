import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAuthUserProfile,
  listFriends,
  addFriend,
  removeFriend,
  updateUsername,
  listFriendRequests,
  respondToFriendRequest,
} from '@data/repositories/socialRepository';
import { supabase } from '@data/clients/supabaseClient';
import type { Friend, FriendRequest, FriendRequestStatus, UserProfile } from './types';
import { getErrorMessage } from '@shared/utils/error';
import { socialKeys } from '@shared/queryKeys';
import { SESSION_ID } from '@shared/utils/sessionId';

export function useAuthProfile() {
  const queryClient = useQueryClient();

  const { data: profile = null, isLoading: loading, error: queryError } = useQuery<UserProfile | null>({
    queryKey: socialKeys.profile(),
    queryFn: async () => {
      const p = await getAuthUserProfile();
      return p ?? null;
    },
  });

  const error = queryError ? getErrorMessage(queryError, 'Failed to load profile') : null;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: socialKeys.profile() });
  }, [queryClient]);

  return { profile, loading, error, refresh } as const;
}

export function useFriends(currentUserId?: string) {
  const queryClient = useQueryClient();

  const { data: friends = [], isLoading: loading, error: queryError } = useQuery<Friend[]>({
    queryKey: socialKeys.friends(currentUserId ?? ''),
    queryFn: () => listFriends(currentUserId!),
    enabled: Boolean(currentUserId),
  });

  const error = queryError ? getErrorMessage(queryError, 'Failed to load friends') : null;

  const fetchFriends = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: socialKeys.friends(currentUserId ?? '') });
  }, [queryClient, currentUserId]);

  const actions = useMemo(
    () => ({
      add: async (username: string) => {
        if (!currentUserId) return;
        const result = await addFriend(currentUserId, username);
        if (result.status === 'accepted' && result.friend) {
          void queryClient.invalidateQueries({ queryKey: socialKeys.friends(currentUserId) });
        }
        return result;
      },
      remove: async (friendUserId: string) => {
        if (!currentUserId) return;
        await removeFriend(currentUserId, friendUserId);
        void queryClient.invalidateQueries({ queryKey: socialKeys.friends(currentUserId) });
      },
      refresh: fetchFriends,
    }),
    [currentUserId, fetchFriends, queryClient]
  );

  return { friends, loading, error, ...actions } as const;
}

export function useFriendRequests(currentUserId?: string) {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading: loading, error: queryError } = useQuery<FriendRequest[]>({
    queryKey: socialKeys.friendRequests(currentUserId ?? ''),
    queryFn: () => listFriendRequests(),
    enabled: Boolean(currentUserId),
  });

  const error = queryError ? getErrorMessage(queryError, 'Failed to load friend requests') : null;

  const fetchRequests = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: socialKeys.friendRequests(currentUserId ?? '') });
  }, [queryClient, currentUserId]);

  // Realtime subscription
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`friend_requests_${currentUserId}_${SESSION_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_user_id=eq.${currentUserId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: socialKeys.friendRequests(currentUserId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);

  const actions = useMemo(
    () => ({
      respond: async (requestId: string, action: 'accept' | 'decline' | 'cancel') => {
        const { request, status } = await respondToFriendRequest(requestId, action);
        void queryClient.invalidateQueries({ queryKey: socialKeys.friendRequests(currentUserId ?? '') });
        return { request, status } as { request: FriendRequest; status: FriendRequestStatus };
      },
      refresh: fetchRequests,
    }),
    [fetchRequests, queryClient, currentUserId],
  );

  return { requests, loading, error, ...actions } as const;
}

export function useUsernameUpdater(userId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (newUsername: string) => {
      if (!userId) return null;
      setLoading(true);
      setError(null);
      try {
        const cleaned = newUsername.replace(/[^a-zA-Z0-9_]/g, '');
        if (cleaned.length < 3 || cleaned.length > 15) {
          throw new Error('Username must be 3-15 characters and use letters, numbers, underscores.');
        }
        // Server performs case-insensitive uniqueness check — no client-side pre-check needed
        return await updateUsername(userId, cleaned);
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to update username'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  return { update, loading, error } as const;
}
