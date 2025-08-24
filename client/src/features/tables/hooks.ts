import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createTable, getTable, getUserTables, subscribeToTableMembers } from '@shared/api/tableService';
import { getUsernamesByIds } from '@shared/api/userService';

export type TableListItem = {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
  last_activity_at: string;
  host_username?: string | null;
  memberCount?: number;
};

export function useTablesList(userId?: string) {
  const [tables, setTables] = useState<TableListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await getUserTables(userId);
      const hostIds = Array.from(new Set(raw.map((t: any) => t.host_user_id)));
      const idToUsername = await getUsernamesByIds(hostIds);
      const items: TableListItem[] = raw.map((t: any) => ({
        table_id: t.table_id,
        table_name: t.table_name,
        host_user_id: t.host_user_id,
        created_at: t.created_at,
        last_activity_at: t.last_activity_at ?? t.created_at,
        host_username: idToUsername[t.host_user_id] ?? null,
  memberCount: (t.table_members || []).length,
      }));
      setTables(items);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load tables');
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (name: string) => {
    if (!userId) throw new Error('Not authenticated');
    const table = await createTable(name, userId);
    // Optimistic add at top; last_activity_at may be null initially
    setTables((prev) => [{
      table_id: table.table_id,
      table_name: table.table_name,
      host_user_id: table.host_user_id,
      created_at: table.created_at,
      last_activity_at: table.last_activity_at ?? table.created_at,
      host_username: null,
    }, ...prev]);
    return table as TableListItem as any;
  }, [userId]);

  return { tables, loading, error, refresh, create } as const;
}

export function useTableView(tableId?: string, userId?: string) {
  const [table, setTable] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  

  const refresh = useCallback(async () => {
    if (!tableId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTable(tableId);
      setTable(data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load table. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!tableId || !userId) return;
    const ch: RealtimeChannel = subscribeToTableMembers(tableId, async () => {
      try { const updated = await getTable(tableId); setTable(updated); } catch {}
    });
    return () => { ch.unsubscribe(); };
  }, [tableId, userId]);

  const members = useMemo(() => (
    (table?.table_members || []).map((tm: any) => ({
      userId: tm.user_id,
      username: tm.users?.username || tm.user_id,
    }))
  ), [table]);

  const isHost = useMemo(() => Boolean(table && userId && table.host_user_id === userId), [table, userId]);

  return { table, loading, error, members, isHost, refresh } as const;
}
