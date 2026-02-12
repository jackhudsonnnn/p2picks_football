import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@data/clients/supabaseClient';
import type { Database } from '@data/types/database.types';

type TableMemberRow = Database['public']['Tables']['table_members']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type BetProposalRow = Database['public']['Tables']['bet_proposals']['Row'];

export interface SubscriptionCallbacks {
  onError?: (status: string, err?: Error) => void;
}

function handleSubscriptionStatus(
  channel: RealtimeChannel,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  return channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      callbacks?.onError?.(status, err);
    }
  });
}

export function subscribeToTableMembers(
  tableId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const channel = supabase
    .channel(`table_members:${tableId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
      (payload: RealtimePostgresChangesPayload<TableMemberRow>) => {
        onChange({ eventType: payload.eventType as 'INSERT' | 'DELETE' | 'UPDATE' });
      },
    );
  return handleSubscriptionStatus(channel, callbacks);
}

export function subscribeToMessages(
  tableId: string,
  onInsert: (payload: { eventType: 'INSERT'; message_id?: string }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const channel = supabase
    .channel(`messages:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `table_id=eq.${tableId}` },
      (payload: RealtimePostgresChangesPayload<MessageRow>) => {
        const newRow = payload.new as Partial<MessageRow>;
        onInsert({ eventType: 'INSERT', message_id: newRow?.message_id });
      },
    );
  return handleSubscriptionStatus(channel, callbacks);
}

export function subscribeToBetProposals(
  tableId: string,
  onUpdate: (payload: { eventType: 'INSERT' | 'UPDATE'; bet_id?: string }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const channel = supabase
    .channel(`bet_proposals:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
      (payload: RealtimePostgresChangesPayload<BetProposalRow>) => {
        const newRow = payload.new as Partial<BetProposalRow>;
        onUpdate({ eventType: 'INSERT', bet_id: newRow?.bet_id });
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
      (payload: RealtimePostgresChangesPayload<BetProposalRow>) => {
        const newRow = payload.new as Partial<BetProposalRow>;
        onUpdate({ eventType: 'UPDATE', bet_id: newRow?.bet_id });
      },
    );
  return handleSubscriptionStatus(channel, callbacks);
}

export function subscribeToUserTables(
  userId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const channel = supabase
    .channel(`user_table_memberships:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_members', filter: `user_id=eq.${userId}` },
      (payload: RealtimePostgresChangesPayload<TableMemberRow>) => {
        onChange({ eventType: payload.eventType as 'INSERT' | 'DELETE' | 'UPDATE' });
      },
    );
  return handleSubscriptionStatus(channel, callbacks);
}

export function subscribeToBetParticipants(
  betId: string,
  onChange: () => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const channel = supabase
    .channel(`bet_participants:${betId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bet_participations', filter: `bet_id=eq.${betId}` },
      () => onChange(),
    );
  return handleSubscriptionStatus(channel, callbacks);
}
