import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import type { Friend, FriendRelation, UserProfile } from '@shared/types/social';

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

export async function updateUsername(userId: string, username: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('user_id, username, email, updated_at')
    .single();
  if (error) throw error;
  return data as UserProfile;
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
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username')
    .in('user_id', friendIds);
  if (error) throw error;
  return (data ?? []).filter((u) => u.username !== null) as Friend[];
}

export async function addFriend(_currentUserId: string, targetUsername: string): Promise<Friend> {
  const payload = await fetchJSON<{ friend: Friend }>(`/api/friends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: targetUsername }),
  });
  return payload.friend;
}

export async function removeFriend(currentUserId: string, friendUserId: string): Promise<void> {
  const { error } = await supabase
    .from('friends')
    .delete()
    .or(
      `and(user_id1.eq.${currentUserId},user_id2.eq.${friendUserId}),and(user_id1.eq.${friendUserId},user_id2.eq.${currentUserId})`,
    );
  if (error) throw error;
}
