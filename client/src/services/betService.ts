// client/src/services/betService.ts

import { supabase } from './supabaseClient';
import { BetProposalFormValues } from '../components/privateTable/chat/BetProposalForm';

// Create a bet proposal and insert a feed item
export async function createBetProposal(tableId: string, proposerUserId: string, form: BetProposalFormValues) {
  // 1. Insert into bet_proposals
  const { data: bet, error: betError } = await supabase
    .from('bet_proposals')
    .insert([
      {
        table_id: tableId,
        proposer_user_id: proposerUserId,
        nba_game_id: form.nba_game_id,
        entity1_name: form.entity1_name,
        entity1_proposition: form.entity1_proposition,
        entity2_name: form.entity2_name,
        entity2_proposition: form.entity2_proposition,
        wager_amount: form.wager_amount,
        time_limit_seconds: form.time_limit_seconds,
      }
    ])
    .select()
    .single();
  if (betError) throw betError;

  // 2. Insert into feed_items
  const { error: feedError } = await supabase
    .from('feed_items')
    .insert([
      {
        table_id: tableId,
        item_type: 'bet_proposal',
        bet_proposal_id: bet.bet_id,
        item_created_at: bet.proposal_time
      }
    ]);
  if (feedError) throw feedError;
  return bet;
}

// Accept a bet proposal: create a bet_participation for the user
export async function acceptBetProposal({ betId, tableId, userId }: { betId: string, tableId: string, userId: string }) {
  const { data, error } = await supabase
    .from('bet_participations')
    .insert([
      {
        bet_id: betId,
        table_id: tableId,
        user_id: userId,
        user_guess: 'pass', // default
        wager_placed: null,
        payout_received: null,
        is_winner: null,
        participation_time: new Date().toISOString(),
      }
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Fetch all bet_participations (tickets) for a user, joining bet_proposals and tables
export async function getUserTickets(userId: string) {
  const { data, error } = await supabase
    .from('bet_participations')
    .select(`
      participation_id,
      bet_id,
      table_id,
      user_id,
      user_guess,
      wager_placed,
      payout_received,
      is_winner,
      participation_time,
      bet_proposals:bet_id (
        bet_id,
        table_id,
        nba_game_id,
        entity1_name,
        entity1_proposition,
        entity2_name,
        entity2_proposition,
        wager_amount,
        time_limit_seconds,
        proposal_time,
        bet_status,
        winning_condition,
        total_pot,
        private_tables:table_id (table_name)
      )
    `)
    .eq('user_id', userId)
    .order('participation_time', { ascending: false });
  if (error) throw error;
  return data;
}

// Check if a user has already accepted a bet proposal
export async function hasUserAcceptedBet(betId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bet_participations')
    .select('participation_id')
    .eq('bet_id', betId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
