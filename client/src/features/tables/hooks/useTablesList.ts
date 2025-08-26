import { useCallback, useEffect, useState } from 'react';
import { createTable, getUserTables } from '@shared/api/tableService';
import { getUsernamesByIds } from '@shared/api/userService';
import type { TableListItem } from '../types';

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
    setTables((prev) => [{
      table_id: table.table_id,
      table_name: table.table_name,
      host_user_id: table.host_user_id,
      created_at: table.created_at,
      last_activity_at: table.last_activity_at ?? table.created_at,
      host_username: null,
      memberCount: 1,
    }, ...prev]);
    return table as TableListItem as any;
  }, [userId]);

  return { tables, loading, error, refresh, create } as const;
}
