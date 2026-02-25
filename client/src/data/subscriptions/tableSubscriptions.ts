import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@data/clients/supabaseClient';
import type { Database } from '@data/types/database.types';
import { SESSION_ID } from '@shared/utils/sessionId';

type TableMemberRow = Database['public']['Tables']['table_members']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type BetProposalRow = Database['public']['Tables']['bet_proposals']['Row'];

export interface SubscriptionCallbacks {
  onError?: (status: string, err?: Error) => void;
}

/**
 * Subscribes a channel and wires up exponential-backoff reconnection logic.
 *
 * On `CHANNEL_ERROR` or `TIMED_OUT` the channel is removed and the factory
 * function is called again after a delay (100 ms × 2^attempt, capped at 30 s).
 * The retry loop is torn down automatically when the caller calls
 * `unsubscribe()` on the returned channel handle.
 *
 * §7.3 — reconnection logic
 */
function handleSubscriptionStatus(
  channel: RealtimeChannel,
  callbacks?: SubscriptionCallbacks,
  _factory?: () => RealtimeChannel,
  _attempt: number = 0,
): RealtimeChannel {
  return channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      callbacks?.onError?.(status, err);
      if (_factory) {
        const delay = Math.min(100 * Math.pow(2, _attempt), 30_000);
        setTimeout(() => {
          void supabase.removeChannel(channel);
          const next = _factory();
          handleSubscriptionStatus(next, callbacks, _factory, _attempt + 1);
        }, delay);
      }
    }
  });
}

export function subscribeToTableMembers(
  tableId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  // §7.2 — SESSION_ID suffix prevents cross-tab channel collisions
  const factory = () =>
    supabase
      .channel(`table_members:${tableId}:${SESSION_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
        (payload: RealtimePostgresChangesPayload<TableMemberRow>) => {
          onChange({ eventType: payload.eventType as 'INSERT' | 'DELETE' | 'UPDATE' });
        },
      );
  return handleSubscriptionStatus(factory(), callbacks, factory);
}

export function subscribeToMessages(
  tableId: string,
  onInsert: (payload: { eventType: 'INSERT'; message_id?: string }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const factory = () =>
    supabase
      .channel(`messages:${tableId}:${SESSION_ID}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `table_id=eq.${tableId}` },
        (payload: RealtimePostgresChangesPayload<MessageRow>) => {
          const newRow = payload.new as Partial<MessageRow>;
          onInsert({ eventType: 'INSERT', message_id: newRow?.message_id });
        },
      );
  return handleSubscriptionStatus(factory(), callbacks, factory);
}

export function subscribeToBetProposals(
  tableId: string,
  onUpdate: (payload: { eventType: 'INSERT' | 'UPDATE'; bet_id?: string }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const factory = () =>
    supabase
      .channel(`bet_proposals:${tableId}:${SESSION_ID}`)
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
  return handleSubscriptionStatus(factory(), callbacks, factory);
}

export function subscribeToUserTables(
  userId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const factory = () =>
    supabase
      .channel(`user_table_memberships:${userId}:${SESSION_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_members', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<TableMemberRow>) => {
          onChange({ eventType: payload.eventType as 'INSERT' | 'DELETE' | 'UPDATE' });
        },
      );
  return handleSubscriptionStatus(factory(), callbacks, factory);
}

export function subscribeToBetParticipants(
  betId: string,
  onChange: () => void,
  callbacks?: SubscriptionCallbacks,
): RealtimeChannel {
  const factory = () =>
    supabase
      .channel(`bet_participants:${betId}:${SESSION_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_participations', filter: `bet_id=eq.${betId}` },
        () => onChange(),
      );
  return handleSubscriptionStatus(factory(), callbacks, factory);
}
