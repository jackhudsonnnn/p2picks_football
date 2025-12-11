// Chat message format for ChatArea
export interface ChatMessage {
  id: string;
  type: 'chat' | 'system' | 'bet_proposal';
  senderUserId: string;
  senderUsername: string;
  text: string;
  timestamp: string;
  tableId?: string;
  betProposalId?: string;
  betDetails?: {
    description: string;
    wager_amount: number;
    time_limit_seconds: number;
    bet_status: string;
    close_time?: string | null;
    winning_choice?: string | null;
    resolution_time?: string | null;
    mode_key?: string;
    nfl_game_id?: string;
    winning_condition_text?: string | null;
  };
}

// Bet proposal message format for ChatArea (narrowing variant where betDetails is required)
export interface BetProposalMessage extends ChatMessage {
  type: 'bet_proposal';
  betProposalId: string;
  betDetails: NonNullable<ChatMessage['betDetails']>;
}
