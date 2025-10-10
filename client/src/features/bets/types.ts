// Domain types for the bets feature

export type BetModeKey = string & { _brand?: 'BetModeKey' };
export type BetStatus = 'active' | 'pending' | 'resolved' | 'washed';

// Input shape for creating a bet proposal (frontend domain)
export interface BetProposalInput {
  nfl_game_id: string;
  wager_amount: number;
  time_limit_seconds: number;
  mode: BetModeKey;
  description: string;
  mode_config?: Record<string, unknown>;
  
  [key: string]: any;
}

// Normalized bet record (subset of bet_proposals with optional per-mode config)
export interface BetRecord {
  bet_id: string;
  table_id: string;
  proposer_user_id: string;
  nfl_game_id?: string | null;
  mode_key?: BetModeKey | null;
  description?: string | null;
  wager_amount?: number | null;
  time_limit_seconds?: number | null;
  proposal_time?: string | null;
  bet_status?: BetStatus | string | null;
  close_time?: string | null;
  winning_choice?: string | null;
  resolution_time?: string | null;
  mode_config?: Record<string, unknown> | null;
  tables?: { table_name?: string } | null;
}

// Ticket (participation) normalized for UI
export interface Ticket {
  betId?: string;
  id: string; // participation_id
  tableId: string;
  tableName: string;
  createdAt: string;
  closedAt: string | null;
  state: string; // keep loose for now to match existing UI
  gameContext: string;
  betDetails: string;
  myGuess: string;
  wager: number;
  payout: number; // simple derived; actual payout finalized server-side
  result: string | null;
  settledStatus: boolean;
  proposalTime?: string;
  timeLimitSeconds?: number;
  modeKey?: BetModeKey | string;
  betStatus?: string;
  closeTime?: string | null;
  winningChoice?: string | null;
  resolutionTime?: string | null;
  // Attach raw bet for mode-scoped rendering/logic to inspect as needed
  betRecord?: BetRecord;
}

export interface TicketCounts {
  total: number;
  active: number;
  pending: number;
  settled: number; // resolved or washed
  wins: number; // resolved and my guess equals winning choice
}
