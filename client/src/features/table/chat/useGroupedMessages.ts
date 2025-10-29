import { useMemo } from 'react';
import { groupByDateLabel } from '@shared/utils/dateTime';
import type { ChatMessage } from '@shared/types/chat';

export interface GroupedMessages {
  dateLabel: string;
  messages: ChatMessage[];
}

export function useGroupedMessages(messages: ChatMessage[]): GroupedMessages[] {
  return useMemo(() => {
    const grouped = groupByDateLabel(messages.map(m => ({ ...m, timestamp: m.timestamp })));
    return Object.entries(grouped).map(([dateLabel, msgs]) => ({ dateLabel, messages: msgs as ChatMessage[] }));
  }, [messages]);
}
