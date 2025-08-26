import { useCallback, useEffect, useState } from 'react';
import { getTable } from '@shared/api/tableService';

export function useTable(tableId?: string) {
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

  return { table, loading, error, refresh } as const;
}
