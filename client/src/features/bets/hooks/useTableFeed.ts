import { useCallback, useEffect, useState } from 'react';
import { getTableFeed, subscribeToBetProposals, subscribeToSystemMessages, subscribeToTextMessages } from '@shared/api/tableService';
import type { ChatMessage } from '@shared/types/chat';

export function useTableFeed(tableId?: string, enabled: boolean = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const loadMessages = useCallback(async () => {
    if (!tableId) {
      setMessages([]);
      return;
    }
    try {
      const data = await getTableFeed(tableId);
      setMessages(data);
    } catch {
      setMessages([]);
    }
  }, [tableId]);

  useEffect(() => {
    if (!enabled) {
      setMessages([]);
      return;
    }
    void loadMessages();
  }, [enabled, loadMessages]);

  useEffect(() => {
    if (!tableId || !enabled) return;
    const refreshFeed = () => {
      void loadMessages();
    };
    const chText = subscribeToTextMessages(tableId, () => refreshFeed());
    const chSystem = subscribeToSystemMessages(tableId, () => refreshFeed());
    const chBets = subscribeToBetProposals(tableId, () => refreshFeed());
    return () => {
      chText.unsubscribe();
      chSystem.unsubscribe();
      chBets.unsubscribe();
    };
  }, [tableId, enabled, loadMessages]);

  const refresh = async () => {
    await loadMessages();
  };

  return { messages, refresh };
}
