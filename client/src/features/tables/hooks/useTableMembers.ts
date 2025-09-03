import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getTable, subscribeToTableMembers } from '@shared/api/tableService';
import type { TableMember } from '../types';

export function useTableMembers(tableId?: string, userId?: string) {
  const [rawTable, setRawTable] = useState<any | null>(null);

  useEffect(() => {
    if (!tableId) return;
    (async () => {
      try { const data = await getTable(tableId); setRawTable(data); } catch {}
    })();
  }, [tableId]);

  useEffect(() => {
    if (!tableId || !userId) return;
    const ch: RealtimeChannel = subscribeToTableMembers(tableId, async () => {
      try { const updated = await getTable(tableId); setRawTable(updated); } catch {}
    });
    return () => { ch.unsubscribe(); };
  }, [tableId, userId]);

  const members: TableMember[] = useMemo(() => (
    (rawTable?.table_members || []).map((tm: any) => ({
      user_id: tm.user_id,
      username: tm.users?.username || tm.user_id,
    }))
  ), [rawTable]);

  const isHost = useMemo(() => Boolean(rawTable && userId && rawTable.host_user_id === userId), [rawTable, userId]);

  return { members, isHost } as const;
}
