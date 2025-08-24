// Central chat & feed related domain types migrated from former src/types/api.ts
// These are shared across bets (feed displaying bet proposals) and table chat UI.

export type FeedItemType = 'text_message' | 'system_message' | 'bet_proposal';

export interface FeedItem {
  feed_item_id: string;
  item_type: FeedItemType;
  item_created_at: string;
  text_message_id?: string;
  system_message_id?: string;
  bet_proposal_id?: string;
  text_messages?: {
    text_message_id: string;
    user_id: string;
    message_text: string;
    posted_at: string;
    users?: { username: string };
  };
  system_messages?: {
    system_message_id: string;
    message_text: string;
    generated_at: string;
  };
}

// Chat message format for ChatArea
export interface ChatMessage {
  id: string;
  type: 'chat' | 'system' | 'bet_proposal';
  senderUserId: string;
  senderUsername: string;
  text: string;
  timestamp: string;
  tableId?: string;
  // Optional fields when type === 'bet_proposal'
  betProposalId?: string;
  betDetails?: {
    description: string;
    wager_amount: number;
    time_limit_seconds: number;
    winning_condition: string;
    bet_status: string;
    close_time?: string | null;
    winning_choice?: string | null;
    resolution_time?: string | null;
    total_pot: number;
    mode_key?: string;
    nfl_game_id?: string;
  };
}

// Bet proposal message format for ChatArea (narrowing variant where betDetails is required)
export interface BetProposalMessage extends ChatMessage {
  type: 'bet_proposal';
  betProposalId: string;
  betDetails: NonNullable<ChatMessage['betDetails']>;
}
