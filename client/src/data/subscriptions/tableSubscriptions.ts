import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@data/clients/supabaseClient';

export function subscribeToTableMembers(
  tableId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`table_members:${tableId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
      (payload) => {
        console.debug('[subscribeToTableMembers] payload:', payload);
        const eventType = (payload as any).eventType as 'INSERT' | 'DELETE' | 'UPDATE';
        onChange({ eventType });
      },
    )
    .subscribe();
  return channel;
}

export function subscribeToMessages(
  tableId: string,
  onInsert: (payload: { eventType: 'INSERT'; message_id?: string }) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`messages:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onInsert({ eventType: 'INSERT', message_id: (payload.new as any)?.message_id });
      },
    )
    .subscribe();
  return channel;
}

export function subscribeToBetProposals(
  tableId: string,
  onUpdate: (payload: { eventType: 'INSERT' | 'UPDATE'; bet_id?: string }) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`bet_proposals:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onUpdate({ eventType: 'INSERT', bet_id: (payload.new as any)?.bet_id });
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onUpdate({ eventType: 'UPDATE', bet_id: (payload.new as any)?.bet_id });
      },
    )
    .subscribe();
  return channel;
}

export function subscribeToUserTables(
  userId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`user_table_memberships:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_members', filter: `user_id=eq.${userId}` },
      (payload) => {
        const eventType = (payload as any).eventType as 'INSERT' | 'DELETE' | 'UPDATE';
        onChange({ eventType });
      },
    )
    .subscribe();

  return channel;
}
