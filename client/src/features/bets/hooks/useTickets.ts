import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import type { Database } from '@data/types/database.types';
import { fetchUserTicketsPage, type TicketListCursor } from '../service';
import { mapParticipationRowToTicket } from '../mappers';
import type { Ticket, TicketCounts } from '../types';
import { logger } from '@shared/utils/logger';
import { ticketKeys } from '@shared/queryKeys';
import { SESSION_ID } from '@shared/utils/sessionId';

type BetParticipationRow = Database['public']['Tables']['bet_participations']['Row'];
type BetProposalRow = Database['public']['Tables']['bet_proposals']['Row'];

export function useTickets(userId?: string) {
  const queryClient = useQueryClient();

  // --- First-page query via TanStack Query ---
  const { data: firstPageData, isLoading: loading } = useQuery({
    queryKey: ticketKeys.list(userId ?? ''),
    queryFn: async () => {
      const page = await fetchUserTicketsPage({ limit: 6 });
      return {
        tickets: (page.participations || []).map(mapParticipationRowToTicket),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
    },
    enabled: Boolean(userId),
  });

  // Local state for extras (load-more pages, realtime patches)
  const [extraTickets, setExtraTickets] = useState<Ticket[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<TicketListCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Realtime patches applied on top of query data
  const [patches, setPatches] = useState<Map<string, Partial<Ticket>>>(new Map());

  // Sync cursor/hasMore when first-page data changes
  useEffect(() => {
    if (firstPageData) {
      setNextCursor(firstPageData.nextCursor);
      setHasMore(firstPageData.hasMore);
      setExtraTickets([]);
      setPatches(new Map());
    }
  }, [firstPageData]);

  // Merge first-page data + extra pages + realtime patches
  const tickets: Ticket[] = useMemo(() => {
    const base = [...(firstPageData?.tickets ?? []), ...extraTickets];
    if (patches.size === 0) return base;
    return base.map((t) => {
      const patch = patches.get(t.id) ?? (t.betId ? patches.get(t.betId) : undefined);
      return patch ? { ...t, ...patch } : t;
    });
  }, [firstPageData, extraTickets, patches]);

  const refresh = useCallback(async (_options?: { silent?: boolean }) => {
    setExtraTickets([]);
    setPatches(new Map());
    await queryClient.invalidateQueries({ queryKey: ticketKeys.list(userId ?? '') });
  }, [queryClient, userId]);

  // Keep a ref of tracked bet IDs so the single subscription callback
  // always sees the latest set without needing to re-subscribe.
  const trackedBetIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    trackedBetIdsRef.current = new Set(tickets.map((t) => t.betId).filter(Boolean) as string[]);
  }, [tickets]);

  // §7.1 — One channel per distinct table_id (instead of a single unfiltered
  // global subscription).  Each channel is filtered server-side with
  // `table_id=eq.<id>` so only relevant rows reach the client.
  // §7.2 — SESSION_ID suffix prevents cross-tab channel collisions.
  const tableIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    tableIdsRef.current = new Set(
      tickets.map((t) => t.tableId).filter(Boolean) as string[],
    );
  }, [tickets]);

  useEffect(() => {
    if (!userId || tickets.length === 0) return;

    const tableIds = Array.from(tableIdsRef.current);
    if (tableIds.length === 0) return;

    const channels = tableIds.map((tableId) =>
      supabase
        .channel(`ticket_proposals:${tableId}:${SESSION_ID}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
          (payload: RealtimePostgresChangesPayload<BetProposalRow>) => {
            const row = (payload.new ?? payload.old) as Partial<BetProposalRow>;
            const betId = row?.bet_id;
            if (!betId || !trackedBetIdsRef.current.has(betId)) return;

            supabase
              .from('bet_proposals')
              .select('bet_id, bet_status, close_time, winning_choice, resolution_time')
              .eq('bet_id', betId)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return;
                const state = data.bet_status as string;
                const settled = state === 'resolved' || state === 'washed';
                setPatches((prev) => {
                  const next = new Map(prev);
                  next.set(betId, {
                    state,
                    closeTime: data.close_time ?? null,
                    winningChoice: data.winning_choice ?? null,
                    resolutionTime: data.resolution_time ?? null,
                    settledStatus: settled,
                    result: data.winning_choice ?? null,
                    closedAt: data.resolution_time ?? null,
                  });
                  return next;
                });
              });
          },
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((ch) => ch.unsubscribe());
    };
  }, [userId, tickets.length > 0]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`my_participations:${userId}:${SESSION_ID}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bet_participations', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<BetParticipationRow>) => {
          const updated = payload.new as Partial<BetParticipationRow>;
          setPatches((prev) => {
            const next = new Map(prev);
            if (updated.participation_id) {
              next.set(updated.participation_id, {
                ...(prev.get(updated.participation_id) ?? {}),
                myGuess: updated.user_guess ?? undefined,
              });
            }
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bet_participations', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ticketKeys.list(userId) });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bet_participations', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<BetParticipationRow>) => {
          const removed = payload.old as Partial<BetParticipationRow>;
          setExtraTickets((prev) => prev.filter((t) => t.id !== removed.participation_id));
          // Also invalidate the query so first-page data is re-fetched
          void queryClient.invalidateQueries({ queryKey: ticketKeys.list(userId) });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId, queryClient]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUserTicketsPage({ limit: 6, before: nextCursor });
      setExtraTickets((prev) => [...prev, ...(page.participations || []).map(mapParticipationRowToTicket)]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      logger.warn('[useTickets] failed to load more tickets', e);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, nextCursor, loadingMore]);

  const counts: TicketCounts = useMemo(() => {
    const active = tickets.filter((t) => t.state === 'active').length;
    const pending = tickets.filter((t) => t.state === 'pending').length;
    const resolved = tickets.filter((t) => t.state === 'resolved').length;
    const washed = tickets.filter((t) => t.state === 'washed').length;

    return {
      total: tickets.length,
      active,
      pending,
      resolved,
      washed,
      settled: resolved + washed,
      wins: tickets.filter((t) => t.state === 'resolved' && t.winningChoice && t.winningChoice === t.myGuess).length,
    };
  }, [tickets]);

  const changeGuess = async (ticketId: string, newGuess: string) => {
    // Find the betId from the ticket so we can call the server endpoint
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket?.betId) {
      throw new Error('Could not find bet for this ticket');
    }

    const updated = await fetchJSON<{ participation_id: string; user_guess: string }>(
      `/api/bets/${encodeURIComponent(ticket.betId)}/guess`,
      {
        method: 'PATCH',
        body: JSON.stringify({ user_guess: newGuess }),
      },
    );

    if (updated) {
      setPatches((prev) => {
        const next = new Map(prev);
        next.set(updated.participation_id, {
          ...(prev.get(updated.participation_id) ?? {}),
          myGuess: updated.user_guess,
        });
        return next;
      });
    }
    await refresh({ silent: true });
  };

  return { tickets, loading, loadingMore, hasMore, counts, refresh, loadMore, changeGuess };
}
