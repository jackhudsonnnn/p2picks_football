import { supabase } from '@data/clients/supabaseClient';

export async function getUsernamesByIds(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  // Reads from the user_profiles view (user_id + username only) — see Phase 5 migration
  const { data, error } = await supabase
    .from('user_profiles' as 'users')
    .select('user_id, username')
    .in('user_id', userIds);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const user of data) {
    map[user.user_id] = user.username ?? user.user_id;
  }
  return map;
}
