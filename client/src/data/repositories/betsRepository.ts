import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import { fetchModeConfigs } from '@data/repositories/modesRepository';
import type { League } from '@shared/types/bet';
import { logger } from '@shared/utils/logger';

export interface BetProposalRequestPayload {
  config_session_id?: string;
  league_game_id?: string;
  league?: League;
  mode_key?: string;
  mode_config?: Record<string, unknown>;
  wager_amount?: number;
  time_limit_seconds?: number;
  // U2Pick-specific fields
  u2pick_winning_condition?: string;
  u2pick_options?: string[];
}

export async function createBetProposal(
  tableId: string,
  proposerUserId: string,
  payload: BetProposalRequestPayload & { preview?: unknown },
) {
  const { preview: _preview, ...rest } = payload;
  return fetchJSON<{ bet_id: string }>(`/api/tables/${encodeURIComponent(tableId)}/bets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposer_user_id: proposerUserId, ...rest }),
  });
}

export async function pokeBet(betId: string) {
  return fetchJSON<{ success: boolean }>(`/api/bets/${encodeURIComponent(betId)}/poke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export interface ValidateBetResult {
  success: boolean;
  bet_id: string;
  winning_choice: string;
  message: string;
}

export async function validateBet(betId: string, winningChoice: string): Promise<ValidateBetResult> {
  return fetchJSON<ValidateBetResult>(`/api/bets/${encodeURIComponent(betId)}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winning_choice: winningChoice }),
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
        user_guess: 'No Entry',
        participation_time: new Date().toISOString(),
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type TicketListCursor = {
  participatedAt: string;
  participationId: string;
};

/** A participation row as returned by the /api/tickets endpoint. */
export interface ParticipationRow {
  participation_id: string;
  bet_id: string;
  table_id: string;
  user_id: string;
  user_guess: string | null;
  participation_time: string;
  bet_proposals?: BetProposalPayload | null;
}

/** Nested bet_proposals shape within a participation row from the server. */
interface BetProposalPayload {
  bet_id: string;
  table_id: string;
  table_name?: string | null;
  proposer_user_id: string;
  league_game_id?: string | null;
  league?: string | null;
  mode_key?: string | null;
  description?: string | null;
  wager_amount?: number | null;
  time_limit_seconds?: number | null;
  proposal_time?: string | null;
  bet_status?: string | null;
  close_time?: string | null;
  winning_choice?: string | null;
  resolution_time?: string | null;
  mode_config?: Record<string, unknown> | null;
  tables?: { table_name?: string } | null;
}

export type TicketListPage = {
  participations: ParticipationRow[];
  nextCursor: TicketListCursor | null;
  hasMore: boolean;
  limit: number;
};

function serializeCursor(params: { before?: TicketListCursor | null; after?: TicketListCursor | null }): string {
  const parts: string[] = [];
  const { before, after } = params;
  if (before) {
    parts.push(`beforeParticipatedAt=${encodeURIComponent(before.participatedAt)}`);
    parts.push(`beforeParticipationId=${encodeURIComponent(before.participationId)}`);
  }
  if (after) {
    parts.push(`afterParticipatedAt=${encodeURIComponent(after.participatedAt)}`);
    parts.push(`afterParticipationId=${encodeURIComponent(after.participationId)}`);
  }
  return parts.join('&');
}

export async function getUserTicketsPage(opts: { limit?: number; before?: TicketListCursor | null; after?: TicketListCursor | null } = {}): Promise<TicketListPage> {
  const params: string[] = [];
  if (opts.limit) {
    params.push(`limit=${opts.limit}`);
  }
  const cursorParams = serializeCursor({ before: opts.before ?? undefined, after: opts.after ?? undefined });
  if (cursorParams) {
    params.push(cursorParams);
  }
  const qs = params.length ? `?${params.join('&')}` : '';

  const page = await fetchJSON<TicketListPage>(`/api/tickets${qs}`);

  const rows = page?.participations ?? [];
  const betIds = Array.from(new Set(rows.map((row) => row.bet_id).filter(Boolean)));
  if (betIds.length) {
    try {
      const configs = await fetchModeConfigs(betIds);
      rows.forEach((row) => {
        const bet = row?.bet_proposals;
        if (!bet) return;
        const record = configs[bet.bet_id];
        if (record && (!bet.mode_key || record.mode_key === bet.mode_key)) {
          bet.mode_config = record.data;
        }
      });
    } catch (cfgErr) {
      logger.warn('[getUserTicketsPage] failed to hydrate mode config', cfgErr);
    }
  }

  return {
    participations: rows,
    nextCursor: page?.nextCursor ?? null,
    hasMore: Boolean(page?.hasMore),
    limit: page?.limit ?? opts.limit ?? 0,
  };
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

export async function getBetParticipantCount(betId: string): Promise<number> {
  const { count, error } = await supabase
    .from('bet_participations')
    .select('participation_id', { count: 'exact', head: true })
    .eq('bet_id', betId);
  if (error) throw error;
  return typeof count === 'number' ? count : 0;
}

export interface BetLiveInfoField {
  label: string;
  value: string | number;
}

export interface BetLiveInfo {
  modeKey: string;
  modeLabel: string;
  fields: BetLiveInfoField[];
  unavailableReason?: string;
  /** ISO timestamp — present only when this is a persisted snapshot */
  capturedAt?: string;
  /** Whether this snapshot was taken at resolve or wash time */
  trigger?: 'resolved' | 'washed';
  /** Winning choice (resolved) or wash reason (washed) */
  outcomeDetail?: string | null;
}

export async function fetchBetLiveInfo(betId: string): Promise<BetLiveInfo> {
  return fetchJSON<BetLiveInfo>(`/api/bets/${encodeURIComponent(betId)}/live-info`);
}
