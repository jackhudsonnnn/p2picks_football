import { supabase } from '@shared/api/supabaseClient';
import { BetProposalInput } from './types';

// Create a bet proposal and insert a feed item
export async function createBetProposal(tableId: string, proposerUserId: string, form: BetProposalInput) {
  const payload: any = {
    table_id: tableId,
    proposer_user_id: proposerUserId,
    nfl_game_id: form.nfl_game_id ?? null,
    mode_key: form.mode ?? null,
    description: form.description,
    wager_amount: form.wager_amount,
    time_limit_seconds: form.time_limit_seconds,
    bet_status: 'active',
  };
  const { data: bet, error: betError } = await supabase
    .from('bet_proposals')
    .insert([payload])
    .select()
    .single();
  if (betError) throw betError;

  // Per-mode configuration table
  try {
    if (form.mode === 'best_of_best') {
      const cfg = {
        bet_id: bet.bet_id,
        player1_name: form.player1_name,
        player2_name: form.player2_name,
        stat: form.stat,
        resolve_after: form.resolve_after,
      };
      const { error: cfgErr } = await supabase.from('bet_mode_best_of_best').insert([cfg]);
      if (cfgErr) throw cfgErr;
    } else if (form.mode === 'one_leg_spread') {
      const cfg = { bet_id: bet.bet_id };
      const { error: cfgErr } = await supabase.from('bet_mode_one_leg_spread').insert([cfg]);
      if (cfgErr) throw cfgErr;
    }
  } catch (cfgError) {
    await supabase.from('bet_proposals').delete().eq('bet_id', bet.bet_id);
    throw cfgError;
  }

  // Feed item
  const { error: feedError } = await supabase
    .from('feed_items')
    .insert([
      {
        table_id: tableId,
        item_type: 'bet_proposal',
        bet_proposal_id: bet.bet_id,
        item_created_at: bet.proposal_time,
      },
    ]);
  if (feedError) throw feedError;

  return bet;
}

// Debug function to get bet proposal details
export async function getBetProposalDetails(betId: string) {
  const { data, error } = await supabase
    .from('bet_proposals')
    .select('bet_id, table_id, bet_status, proposer_user_id, close_time, winning_choice, resolution_time')
    .eq('bet_id', betId)
    .single();
  if (error) throw error;
  return data;
}

// Accept a bet proposal: create a bet_participation for the user
export async function acceptBetProposal({ betId, tableId, userId }: { betId: string; tableId: string; userId: string }) {
  const { data, error } = await supabase
    .from('bet_participations')
    .insert([
      {
        bet_id: betId,
        table_id: tableId,
        user_id: userId,
        user_guess: 'pass',
        participation_time: new Date().toISOString(),
      },
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
    .select(
      `
      participation_id,
      bet_id,
      table_id,
      user_id,
      user_guess,
      participation_time,
      bet_proposals:bet_id (
        bet_id,
        table_id,
        nfl_game_id,
        mode_key,
        description,
        wager_amount,
        time_limit_seconds,
        proposal_time,
        bet_status,
        close_time,
        winning_condition,
        winning_choice,
        resolution_time,
        total_pot,
        bet_mode_best_of_best!bet_mode_best_of_best_bet_id_fkey (player1_name, player2_name, stat, resolve_after),
        bet_mode_one_leg_spread!bet_mode_one_leg_spread_bet_id_fkey (bet_id),
        tables:table_id (table_name)
      )
    `
    )
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
