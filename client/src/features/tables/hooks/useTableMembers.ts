import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getTable, subscribeToTableMembers } from '@shared/api/tableService';
import type { TableMember } from '../types';
import { normalizeToHundredth } from '@shared/utils/number';

export function useTableMembers(tableId?: string, userId?: string) {
  const [rawTable, setRawTable] = useState<any | null>(null);

  useEffect(() => {
    if (!tableId) return;
    (async () => {
      try { const data = await getTable(tableId); setRawTable(data); } catch {}
    })();
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return;
    (async () => {
      try {
        console.debug('[useTableMembers] initial getTable for', tableId);
        const data = await getTable(tableId);
        console.debug('[useTableMembers] initial getTable result:', data);
        setRawTable(data);
      } catch (err) {
        console.debug('[useTableMembers] initial getTable failed', err);
      }
    })();
  }, [tableId]);

  useEffect(() => {
    if (!tableId || !userId) return;
    const ch: RealtimeChannel = subscribeToTableMembers(tableId, async (payload) => {
      try {
        console.debug('[useTableMembers] subscription triggered, payload:', payload);
        const updated = await getTable(tableId);
        console.debug('[useTableMembers] refetched table after subscription:', updated);
        setRawTable(updated);
      } catch (err) {
        console.debug('[useTableMembers] failed to refetch table after subscription', err);
      }
    });
    return () => { ch.unsubscribe(); };
  }, [tableId, userId]);

  const members: TableMember[] = useMemo(() => (
    (rawTable?.table_members || []).map((tm: any) => ({
      user_id: tm.user_id,
      username: tm.users?.username || tm.user_id,
      // table_members.balance is double precision in the DB; ensure it's a number here
      balance: tm.balance != null ? normalizeToHundredth(Number(tm.balance)) : 0,
    }))
  ), [rawTable]);

  const isHost = useMemo(() => Boolean(rawTable && userId && rawTable.host_user_id === userId), [rawTable, userId]);

  return { members, isHost } as const;
}
