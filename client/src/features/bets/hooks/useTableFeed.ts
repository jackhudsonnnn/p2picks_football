import { useEffect, useState } from 'react';
import { getTableFeed, subscribeToBetProposals, subscribeToFeedItems } from '@entities/table/service';
import type { ChatMessage } from '../../../types/api';

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
        const desc: string = bet.description || (() => {
          if (bet.mode_key === 'best_of_best' && bet.bet_mode_best_of_best) {
            const cfg = Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best;
            return `Best of the Best • ${cfg?.stat} • ${cfg?.settle_at} — ${cfg?.player1_name ?? 'Player 1'} vs ${cfg?.player2_name ?? 'Player 2'}`;
          } else if (bet.mode_key === 'one_leg_spread') {
            return `1 Leg Spread`;
          }
          return 'Bet';
        })();
        return {
          id: item.feed_item_id,
          type: 'bet_proposal',
          senderUserId: bet.proposer_user_id,
          senderUsername: username,
          text: desc,
          timestamp: bet.proposal_time,
          betProposalId: bet.bet_id,
          betDetails: {
            description: desc,
            wager_amount: bet.wager_amount,
            time_limit_seconds: bet.time_limit_seconds,
            winning_condition: bet.winning_condition,
            bet_status: bet.bet_status,
            close_time: bet.close_time,
            winning_choice: bet.winning_choice,
            resolution_time: bet.resolution_time,
            total_pot: bet.total_pot,
            mode_key: bet.mode_key,
            nfl_game_id: bet.nfl_game_id,
          },
          tableId: bet.table_id,
        } as ChatMessage;
      }
      return null;
    });
  return mapped.filter(Boolean) as ChatMessage[];
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
