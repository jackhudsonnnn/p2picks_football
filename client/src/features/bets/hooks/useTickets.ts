import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@shared/api/supabaseClient';
import { getUserTickets } from '../service';
import { mapParticipationRowToTicket } from '../mappers';
import type { Ticket, TicketCounts } from '../types';
import { subscribeToBetProposals } from '@shared/api/tableService';

export function useTickets(userId?: string) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = () => {
    if (!userId) return;
    setLoading(true);
    getUserTickets(userId)
      .then((data) => setTickets((data || []).map(mapParticipationRowToTicket)))
      .finally(() => setLoading(false));
  };

  // initial load
  useEffect(() => {
    if (!userId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // realtime subscriptions for bet status & my participations
  useEffect(() => {
    if (!userId || tickets.length === 0) return;
    const uniqueTables = Array.from(new Set(tickets.map((t) => t.tableId)));
    const channels: RealtimeChannel[] = [];

    uniqueTables.forEach((tid) => {
      const ch = subscribeToBetProposals(tid, ({ bet_id }) => {
        if (!bet_id) return;
        supabase
          .from('bet_proposals')
          .select('bet_id, bet_status, close_time, winning_choice, resolution_time')
          .eq('bet_id', bet_id)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) return;
            setTickets((prev) =>
              prev.map((t) => {
                if (t.betId === data.bet_id) {
                  const state = data.bet_status as string;
                  const settled = state === 'resolved' || state === 'washed';
                  return {
                    ...t,
                    state,
                    closeTime: data.close_time ?? t.closeTime ?? null,
                    winningChoice: data.winning_choice ?? t.winningChoice ?? null,
                    resolutionTime: data.resolution_time ?? t.resolutionTime ?? null,
                    settledStatus: settled,
                    result: data.winning_choice ?? t.result ?? null,
                    closedAt: data.resolution_time ?? t.closedAt ?? null,
                  };
                }
                return t;
              })
            );
          });
      });
      channels.push(ch);
    });

    const chMyParts = supabase
      .channel(`my_participations:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bet_participations', filter: `user_id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as any;
          setTickets((prev) =>
            prev.map((t) => (t.id === updated.participation_id ? { ...t, myGuess: updated.user_guess } : t))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bet_participations', filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bet_participations', filter: `user_id=eq.${userId}` },
        (payload) => {
          const removed = payload.old as any;
          setTickets((prev) => prev.filter((t) => t.id !== removed.participation_id));
        }
      )
      .subscribe();

    return () => {
      channels.forEach((c) => c.unsubscribe());
      chMyParts.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tickets]);

  const counts: TicketCounts = useMemo(() => {
    return {
      total: tickets.length,
      active: tickets.filter((t) => t.state === 'active').length,
      pending: tickets.filter((t) => t.state === 'pending').length,
      settled: tickets.filter((t) => t.state === 'resolved' || t.state === 'washed').length,
      wins: tickets.filter((t) => t.state === 'resolved' && t.winningChoice && t.winningChoice === t.myGuess).length,
    };
  }, [tickets]);

  const changeGuess = async (ticketId: string, newGuess: string) => {
    try {
      const { data: updated, error } = await supabase
        .from('bet_participations')
        .update({ user_guess: newGuess })
        .eq('participation_id', ticketId)
        .select('participation_id, user_guess')
        .single();
      if (error) throw error;
      if (updated) {
        setTickets((prev) => prev.map((t) => (t.id === updated.participation_id ? { ...t, myGuess: updated.user_guess } : t)));
      }
      refresh();
    } catch (e) {
      throw e;
    }
  };

  return { tickets, loading, counts, refresh, changeGuess };
}
