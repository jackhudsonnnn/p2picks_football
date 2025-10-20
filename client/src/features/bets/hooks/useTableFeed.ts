import { useCallback, useEffect, useRef, useState } from 'react';
import { getTableFeed, subscribeToBetProposals, subscribeToMessages, type TableFeedCursor } from '@shared/api/tableService';
import type { ChatMessage } from '@shared/types/chat';

export function useTableFeed(tableId?: string, enabled: boolean = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<TableFeedCursor | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const hasLoadedOlderRef = useRef(false);

  const loadLatest = useCallback(async (opts?: { showLoading?: boolean }) => {
    if (!tableId) {
      setMessages([]);
      setCursor(null);
      setHasMore(false);
      return;
    }

    const showLoading = opts?.showLoading ?? true;
    if (showLoading) setInitialLoading(true);

    try {
      const page = await getTableFeed(tableId);
      setMessages((prev) => {
        if (!prev.length) {
          return page.messages;
        }
        const latestIds = new Set(page.messages.map((m) => m.id));
        const olderMessages = prev.filter((msg) => !latestIds.has(msg.id));
        const merged = [...olderMessages, ...page.messages];
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return merged;
      });
      setCursor((prevCursor) => (hasLoadedOlderRef.current ? prevCursor : page.nextCursor));
      setHasMore((prevHasMore) => (hasLoadedOlderRef.current ? prevHasMore : page.hasMore));
    } catch (error) {
      console.warn('[useTableFeed] failed to load messages', error);
      if (!hasLoadedOlderRef.current) {
        setMessages([]);
        setCursor(null);
        setHasMore(false);
      }
    } finally {
      if (showLoading) setInitialLoading(false);
    }
  }, [tableId]);

  const loadMore = useCallback(async () => {
    if (!tableId || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await getTableFeed(tableId, { before: cursor });
      if (page.messages.length) {
        hasLoadedOlderRef.current = true;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((msg) => msg.id));
          const next = [...page.messages.filter((msg) => !existingIds.has(msg.id)), ...prev];
          next.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          return next;
        });
      }
      setCursor(page.nextCursor ?? null);
      setHasMore(page.hasMore);
    } catch (error) {
      console.warn('[useTableFeed] failed to load older messages', error);
    } finally {
      setLoadingMore(false);
    }
  }, [tableId, cursor]);

  const refresh = useCallback(async () => {
    await loadLatest({ showLoading: false });
  }, [loadLatest]);

  useEffect(() => {
    if (!enabled || !tableId) {
      hasLoadedOlderRef.current = false;
      setMessages([]);
      setCursor(null);
      setHasMore(false);
      setInitialLoading(false);
      setLoadingMore(false);
      return;
    }

    hasLoadedOlderRef.current = false;
    void loadLatest();
  }, [enabled, tableId, loadLatest]);

  useEffect(() => {
    if (!tableId || !enabled) return;
    const handleUpdate = () => {
      void loadLatest({ showLoading: false });
    };
    const chMessages = subscribeToMessages(tableId, () => handleUpdate());
    const chBets = subscribeToBetProposals(tableId, () => handleUpdate());
    return () => {
      chMessages.unsubscribe();
      chBets.unsubscribe();
    };
  }, [tableId, enabled, loadLatest]);

  return {
    messages,
    hasMore,
    loadMore,
    isLoading: initialLoading,
    isLoadingMore: loadingMore,
    refresh,
  } as const;
}
