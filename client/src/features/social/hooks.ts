import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthUserProfile, listFriends, addFriend, removeFriend, isUsernameTaken, updateUsername } from './service';
import type { Friend, UserProfile } from './types';

export function useAuthProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getAuthUserProfile();
      setProfile(p);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, error, refresh } as const;
}

export function useFriends(currentUserId?: string) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFriends = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listFriends(currentUserId);
      setFriends(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const actions = useMemo(
    () => ({
      add: async (username: string) => {
        if (!currentUserId) return;
        const friend = await addFriend(currentUserId, username);
        setFriends((prev) => [...prev, friend]);
      },
      remove: async (friendUserId: string) => {
        if (!currentUserId) return;
        await removeFriend(currentUserId, friendUserId);
        setFriends((prev) => prev.filter((f) => f.user_id !== friendUserId));
      },
      refresh: fetchFriends,
    }),
    [currentUserId, fetchFriends]
  );

  return { friends, loading, error, ...actions } as const;
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
        const taken = await isUsernameTaken(cleaned, userId);
        if (taken) throw new Error('Username already taken.');
        return await updateUsername(userId, cleaned);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to update username');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  return { update, loading, error } as const;
}
