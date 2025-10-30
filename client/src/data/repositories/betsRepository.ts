import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import { fetchModeConfigs } from '@data/repositories/modesRepository';

export interface BetProposalRequestPayload {
  nfl_game_id: string;
  mode_key: string;
  mode_config?: Record<string, unknown>;
  wager_amount: number;
  time_limit_seconds: number;
}

export async function createBetProposal(
  tableId: string,
  proposerUserId: string,
  payload: BetProposalRequestPayload & { preview?: unknown },
) {
  const { preview: _preview, ...rest } = payload;
  return fetchJSON(`/api/tables/${encodeURIComponent(tableId)}/bets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposer_user_id: proposerUserId, ...rest }),
  });
}

export async function pokeBet(betId: string) {
  return fetchJSON(`/api/bets/${encodeURIComponent(betId)}/poke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function acceptBetProposal({
  betId,
  tableId,
  userId,
}: {
  betId: string;
  tableId: string;
  userId: string;
}) {
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
        winning_choice,
        resolution_time,
        tables:table_id (table_name)
      )
    `,
    )
    .eq('user_id', userId)
    .order('participation_time', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const betIds = Array.from(new Set(rows.map((row: any) => row.bet_id).filter(Boolean))) as string[];
  if (betIds.length) {
    try {
      const configs = await fetchModeConfigs(betIds);
      rows.forEach((row: any) => {
        const bet = row?.bet_proposals;
        if (!bet) return;
        const record = configs[bet.bet_id];
        if (record && (!bet.mode_key || record.mode_key === bet.mode_key)) {
          (bet as any).mode_config = record.data;
        }
      });
    } catch (cfgErr) {
      console.warn('[getUserTickets] failed to hydrate mode config', cfgErr);
    }
  }
  return rows;
}

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
