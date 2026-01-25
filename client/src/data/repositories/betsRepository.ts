import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import { fetchModeConfigs } from '@data/repositories/modesRepository';

export interface BetProposalRequestPayload {
  config_session_id?: string;
  league_game_id?: string;
  league?: 'U2Pick' |'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF';
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

export type TicketListPage = {
  participations: any[];
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
      console.warn('[getUserTicketsPage] failed to hydrate mode config', cfgErr);
    }
  }

  return {
    participations: rows,
    nextCursor: page?.nextCursor ?? null,
    hasMore: Boolean(page?.hasMore),
    limit: page?.limit ?? opts.limit ?? 0,
  };
}

// Backward-compatible helper used by legacy call sites
export async function getUserTickets(_userId: string) {
  const page = await getUserTicketsPage({ limit: 50 });
  return page.participations;
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

export interface BetLiveInfoField {
  label: string;
  value: string | number;
}

export interface BetLiveInfo {
  modeKey: string;
  modeLabel: string;
  fields: BetLiveInfoField[];
  unavailableReason?: string;
}

export async function fetchBetLiveInfo(betId: string): Promise<BetLiveInfo> {
  return fetchJSON<BetLiveInfo>(`/api/bets/${encodeURIComponent(betId)}/live-info`);
}
