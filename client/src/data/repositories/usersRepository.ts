import { supabase } from '@data/clients/supabaseClient';

export async function getUsernamesByIds(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username')
    .in('user_id', userIds);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const user of data) {
    map[user.user_id] = user.username ?? user.user_id;
  }
  return map;
}
