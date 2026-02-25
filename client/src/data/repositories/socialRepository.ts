import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import type {
  Friend,
  FriendRelation,
  FriendRequest,
  FriendRequestStatus,
  UserProfile,
} from '@shared/types/social';

export async function getAuthUserProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, email, updated_at')
    .eq('user_id', user.id)
    .single();
  if (error) {
    return { user_id: user.id, username: null, email: user.email ?? null } as UserProfile;
  }
  return data as UserProfile;
}

export async function updateUsername(_userId: string, username: string): Promise<UserProfile> {
  const data = await fetchJSON<UserProfile>('/api/users/me/username', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  return data;
}

export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const query = supabase.from('users').select('user_id').eq('username', username);
  const { data, error } = excludeUserId
    ? await query.neq('user_id', excludeUserId).maybeSingle()
    : await query.maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return Boolean(data);
}

export async function listFriendRelations(currentUserId: string): Promise<FriendRelation[]> {
  const { data, error } = await supabase
    .from('friends')
    .select('user_id1, user_id2')
    .or(`user_id1.eq.${currentUserId},user_id2.eq.${currentUserId}`);
  if (error) throw error;
  return (data ?? []) as FriendRelation[];
}

export async function listFriends(currentUserId: string): Promise<Friend[]> {
  const relations = await listFriendRelations(currentUserId);
  const friendIds = relations
    .map((r) => (r.user_id1 === currentUserId ? r.user_id2 : r.user_id1))
    .filter((id) => id !== currentUserId);
  if (friendIds.length === 0) return [];
  // Reads from the user_profiles view (user_id + username only) — see Phase 5 migration
  const { data, error } = await supabase
    .from('user_profiles' as 'users')
    .select('user_id, username')
    .in('user_id', friendIds);
  if (error) throw error;
  return (data ?? []).filter((u) => u.username !== null) as Friend[];
}

type AddFriendResult =
  | { status: 'pending'; request: FriendRequest }
  | { status: 'accepted'; friend: Friend };

export async function addFriend(_currentUserId: string, targetUsername: string): Promise<AddFriendResult> {
  const payload = await fetchJSON<{ friend?: Friend; request?: FriendRequest; status: FriendRequestStatus }>(`/api/friends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: targetUsername }),
  });

  if (payload.status === 'accepted' && payload.friend) {
    return { status: 'accepted', friend: payload.friend };
  }

  if (payload.request) {
    return { status: 'pending', request: payload.request };
  }

  throw new Error('Unexpected response creating friend request');
}

export async function removeFriend(_currentUserId: string, friendUserId: string): Promise<void> {
  await fetchJSON<{ removed: boolean }>(
    `/api/friends/${encodeURIComponent(friendUserId)}`,
    { method: 'DELETE' },
  );
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  const payload = await fetchJSON<{ requests: FriendRequest[] }>(`/api/friend-requests`, {
    method: 'GET',
  });
  return payload.requests ?? [];
}

export async function respondToFriendRequest(
  requestId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<{ request: FriendRequest; status: FriendRequestStatus }> {
  const payload = await fetchJSON<{ request: FriendRequest; status: FriendRequestStatus }>(
    `/api/friend-requests/${requestId}/${action}`,
    {
      method: 'POST',
    },
  );
  return payload;
}
