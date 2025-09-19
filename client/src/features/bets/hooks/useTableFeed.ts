import { useEffect, useState } from 'react';
import { getTableFeed, subscribeToBetProposals, subscribeToFeedItems } from '@shared/api/tableService';
import { formatTimeOfDay } from '@shared/utils/dateTime';
import type { ChatMessage } from '@shared/types/chat';

// Centralized feed mapping reused by PrivateTableView
export async function mapFeedItemsToChatMessages(items: any[]): Promise<ChatMessage[]> {
  const mapped: (ChatMessage | null)[] = items
    .filter((item) => item.item_type === 'text_message' || item.item_type === 'system_message' || item.item_type === 'bet_proposal')
    .map((item) => {
      if (item.item_type === 'text_message' && item.text_messages) {
        const msg = Array.isArray(item.text_messages) ? item.text_messages[0] : item.text_messages;
        let username = 'Unknown';
        if (msg.users) {
          if (Array.isArray(msg.users)) username = msg.users[0]?.username || 'Unknown';
          else username = (msg.users as any).username || 'Unknown';
        }
        return {
          id: item.feed_item_id,
          type: 'chat',
          senderUserId: msg.user_id,
          senderUsername: username,
          text: msg.message_text,
          timestamp: msg.posted_at,
        } as ChatMessage;
      } else if (item.item_type === 'system_message' && item.system_messages) {
        const sys = Array.isArray(item.system_messages) ? item.system_messages[0] : item.system_messages;
        return {
          id: item.feed_item_id,
          type: 'system',
          senderUserId: '',
          senderUsername: '',
          text: sys.message_text,
          timestamp: sys.generated_at,
        } as ChatMessage;
      } else if (item.item_type === 'bet_proposal' && item.bet_proposal) {
        const bet = Array.isArray(item.bet_proposal) ? item.bet_proposal[0] : item.bet_proposal;
        let username = 'Unknown';
        if (bet.users) {
          if (Array.isArray(bet.users)) username = bet.users[0]?.username || 'Unknown';
          else username = (bet.users as any).username || 'Unknown';
        }

        const description = bet.description || 'Bet';

        // Primary system-style proposal card (no long description text)
        const proposalMessage: ChatMessage = {
          id: item.feed_item_id,
          type: 'bet_proposal',
          senderUserId: bet.proposer_user_id,
          senderUsername: username,
          text: '',
          timestamp: bet.proposal_time,
          betProposalId: bet.bet_id,
          betDetails: {
            description,
            wager_amount: bet.wager_amount,
            time_limit_seconds: bet.time_limit_seconds,
            bet_status: bet.bet_status,
            close_time: bet.close_time,
            winning_choice: bet.winning_choice,
            resolution_time: bet.resolution_time,
            total_pot: bet.total_pot,
            mode_key: bet.mode_key,
            nfl_game_id: bet.nfl_game_id,
          },
          tableId: bet.table_id,
        };

        // Follow-up user chat message with instructions & details
        const betIdShort = bet.bet_id?.slice(0, 8) ?? '';
        const closeTimeText = formatTimeOfDay(bet.close_time, { includeSeconds: true });

        const detailLines: string[] = [
          `Join my bet #${betIdShort}.`,
          `${bet.wager_amount} pt(s) | ${bet.time_limit_seconds}s to pick`,
          bet.mode_key,
          description,
          closeTimeText ? `Closes at ${closeTimeText}` : null,
        ].filter(Boolean) as string[];
        const detailMessage: ChatMessage = {
          id: `${item.feed_item_id}-details`,
          type: 'chat',
          senderUserId: bet.proposer_user_id,
            senderUsername: username,
          text: detailLines.join('\n'),
          timestamp: bet.proposal_time,
          tableId: bet.table_id,
        };
        return [proposalMessage, detailMessage] as unknown as ChatMessage; // flattened below
      }
      return null;
    });
  // Flatten because bet proposals now return two messages
  const flat: ChatMessage[] = [];
  for (const m of mapped) {
    if (!m) continue;
    if (Array.isArray(m as any)) {
      (m as any).forEach((x: ChatMessage) => flat.push(x));
    } else {
      flat.push(m as ChatMessage);
    }
  }
  return flat;
}

export function useTableFeed(tableId?: string, enabled: boolean = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!tableId || !enabled) return;
    getTableFeed(tableId)
      .then((items: any[]) => mapFeedItemsToChatMessages(items))
      .then((mapped) => setMessages(mapped))
      .catch(() => setMessages([]));
  }, [tableId, enabled]);

  useEffect(() => {
    if (!tableId || !enabled) return;
    const chFeed = subscribeToFeedItems(tableId, async () => {
      const items = await getTableFeed(tableId);
      setMessages(await mapFeedItemsToChatMessages(items));
    });
    const chBets = subscribeToBetProposals(tableId, async () => {
      const items = await getTableFeed(tableId);
      setMessages(await mapFeedItemsToChatMessages(items));
    });
    return () => {
      chFeed.unsubscribe();
      chBets.unsubscribe();
    };
  }, [tableId, enabled]);

  const refresh = async () => {
    if (!tableId) return;
    const items = await getTableFeed(tableId);
    setMessages(await mapFeedItemsToChatMessages(items));
  };

  return { messages, refresh };
}
