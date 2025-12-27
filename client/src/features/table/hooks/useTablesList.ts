import { useCallback, useEffect, useState } from 'react';
import { createTable, fetchUserTablesPage, subscribeToUserTables } from '../services/tableService';
import type { TableListCursor } from '../services/tableService';
import type { TableListItem } from '../types';

const PAGE_SIZE = 6;

export function useTablesList(userId?: string) {
  const [tables, setTables] = useState<TableListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<TableListCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchUserTablesPage({ limit: PAGE_SIZE });
      setTables(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load tables');
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToUserTables(userId, () => {
      refresh();
    });
    return () => {
      try { channel?.unsubscribe(); } catch (err) { console.warn('Failed to unsubscribe user table channel', err); }
    };
  }, [userId, refresh]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUserTablesPage({ limit: PAGE_SIZE, before: nextCursor });
      setTables((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load more tables');
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, nextCursor, loadingMore]);

  const create = useCallback(async (name: string) => {
    if (!userId) throw new Error('Not authenticated');
    const table = await createTable(name, userId);
    await refresh();
    return table;
  }, [userId, refresh]);

  return { tables, loading, loadingMore, error, refresh, loadMore, hasMore, create } as const;
}
