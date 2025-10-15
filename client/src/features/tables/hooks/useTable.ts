import { useCallback, useEffect, useState } from 'react';
import { getTable } from '@shared/api/tableService';
import type { TableWithMembers } from '../types';

export function useTable(tableId?: string) {
  const [table, setTable] = useState<TableWithMembers | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(tableId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!tableId) {
      setTable(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getTable(tableId);
      setTable(data as TableWithMembers);
    } catch (e: unknown) {
      const message = e instanceof Error && e.message
        ? e.message
        : 'Could not load table. Please try again.';
      setError(message);
      setTable(null);
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [tableId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { table, loading, error, refresh } as const;
}
