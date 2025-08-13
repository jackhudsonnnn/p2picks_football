// Core types and contracts for game modes

export type ModeKey = 'best_of_best' | 'one_leg_spread';

export interface ModeContext {
  // Raw bet object from Supabase insert/select
  bet: any;
}

export interface ModeDefinition {
  key: ModeKey;
  label: string;
  // Valid non-pass choices for determining winners
  winningChoices: string[];
  // For POC: pick a random winning choice
  pickRandomWinner(ctx: ModeContext): string;
}
