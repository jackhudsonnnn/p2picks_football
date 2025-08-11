// Chat feed item types for table chat
export type FeedItemType = 'text_message' | 'system_notification' | 'bet_proposal';

export interface FeedItem {
  feed_item_id: string;
  item_type: FeedItemType;
  item_created_at: string;
  text_message_id?: string;
  system_notification_id?: string;
  bet_proposal_id?: string;
  text_messages?: {
    text_message_id: string;
    user_id: string;
    message_text: string;
    posted_at: string;
    users?: { username: string };
  };
  system_notifications?: {
    system_notification_id: string;
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
  // NFL-only
    entity1_name: string;
    entity1_proposition: string;
    entity2_name: string;
    entity2_proposition: string;
    wager_amount: number;
    time_limit_seconds: number;
    winning_condition: string;
    bet_status: string;
    total_pot: number;
    mode_key?: string;
    nfl_game_id?: string;
  };
}

// Bet proposal message format for ChatArea
export interface BetProposalMessage {
  id: string;
  type: 'bet_proposal';
  senderUserId: string;
  senderUsername: string;
  text: string;
  timestamp: string;
  betProposalId: string;
  betDetails: {
  // NFL-only
    entity1_name: string;
    entity1_proposition: string;
    entity2_name: string;
    entity2_proposition: string;
    wager_amount: number;
    time_limit_seconds: number;
    winning_condition: string;
    bet_status: string;
    total_pot: number;
    mode_key?: string;
    nfl_game_id?: string;
  };
  tableId?: string;
}
