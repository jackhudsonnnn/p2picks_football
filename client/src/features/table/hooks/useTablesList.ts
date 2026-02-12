import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createTable, fetchUserTablesPage, subscribeToUserTables } from '../services/tableService';
import type { TableListCursor } from '../services/tableService';
import type { TableListItem } from '../types';
import { getErrorMessage } from '@shared/utils/error';
import { logger } from '@shared/utils/logger';
import { tableKeys } from '@shared/queryKeys';

const PAGE_SIZE = 6;

export function useTablesList(userId?: string) {
  const queryClient = useQueryClient();
  const [extraPages, setExtraPages] = useState<TableListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<TableListCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: firstPage, isLoading: loading } = useQuery({
    queryKey: tableKeys.list(userId ?? ''),
    queryFn: async () => {
      const page = await fetchUserTablesPage({ limit: PAGE_SIZE });
      return page;
    },
    enabled: Boolean(userId),
  });

  // Sync cursor / hasMore from the first-page query
  useEffect(() => {
    if (firstPage) {
      setNextCursor(firstPage.nextCursor);
      setHasMore(firstPage.hasMore);
      setExtraPages([]);
    }
  }, [firstPage]);

  const tables: TableListItem[] = [...(firstPage?.items ?? []), ...extraPages];

  const refresh = useCallback(async () => {
    setExtraPages([]);
    setError(null);
    await queryClient.invalidateQueries({ queryKey: tableKeys.list(userId ?? '') });
  }, [queryClient, userId]);

  // Realtime subscription — invalidate query on changes
  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToUserTables(userId, () => {
      void queryClient.invalidateQueries({ queryKey: tableKeys.list(userId) });
    });
    return () => {
      try { channel?.unsubscribe(); } catch (err) { logger.warn('Failed to unsubscribe user table channel', err); }
    };
  }, [userId, queryClient]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUserTablesPage({ limit: PAGE_SIZE, before: nextCursor });
      setExtraPages((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load more tables'));
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
