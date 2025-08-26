import { useState } from 'react';
import type { BetProposalFormValues } from '@components/Bet/BetProposalForm/BetProposalForm';
import { sendTextMessage } from '@shared/api/tableService';
import { createBetProposal } from '@features/bets/service';
import { useTableFeed } from '@features/bets/hooks/useTableFeed';
import type { ChatMessage } from '@shared/types/chat';

export function useTableChat(tableId?: string, userId?: string) {
  const { messages, refresh } = useTableFeed(tableId, Boolean(tableId && userId));
  const [betLoading, setBetLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!tableId || !userId || !text.trim()) return;
    await sendTextMessage(tableId, userId, text.trim());
    await refresh();
  };

  const proposeBet = async (form: BetProposalFormValues) => {
    if (!tableId || !userId) return;
    setBetLoading(true);
    try {
      await createBetProposal(tableId, userId, form);
      await refresh();
    } finally {
      setBetLoading(false);
    }
  };

  return { messages: messages as ChatMessage[], sendMessage, proposeBet, betLoading, refreshFeed: refresh } as const;
}
