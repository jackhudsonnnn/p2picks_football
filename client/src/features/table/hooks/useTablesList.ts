import { useCallback, useEffect, useState } from 'react';
import { createTable, fetchUserTables } from '../services/tableService';
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
      const items = await fetchUserTables(userId);
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
    setTables((prev) => [table, ...prev]);
  return table;
  }, [userId]);

  return { tables, loading, error, refresh, create } as const;
}
