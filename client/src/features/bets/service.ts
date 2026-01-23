import {
  createBetProposal as createBetProposalRepo,
  pokeBet as pokeBetRepo,
  acceptBetProposal as acceptBetProposalRepo,
  getUserTickets as getUserTicketsRepo,
  hasUserAcceptedBet as hasUserAcceptedBetRepo,
  fetchBetLiveInfo as fetchBetLiveInfoRepo,
  type BetProposalRequestPayload,
  type BetLiveInfo,
  type TicketListPage,
  type TicketListCursor,
  getUserTicketsPage,
} from '@data/repositories/betsRepository';
import {
  fetchModeOverviews as fetchModeOverviewsRepo,
  fetchModePreview as fetchModePreviewRepo,
} from '@data/repositories/modesRepository';
import type { ModePreviewPayload } from '@shared/types/modes';
import type { League } from './types';
import { fetchJSON } from '@data/clients/restClient';

export type { BetProposalRequestPayload };
export type { ModePreviewPayload };
export type { BetLiveInfo };

export async function createBetProposal(
  tableId: string,
  proposerUserId: string,
  payload: BetProposalRequestPayload & { preview?: unknown },
) {
  return createBetProposalRepo(tableId, proposerUserId, payload);
}

export async function pokeBet(betId: string) {
  return pokeBetRepo(betId);
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
  return acceptBetProposalRepo({ betId, tableId, userId });
}

export async function getUserTickets(userId: string) {
  console.warn('[betsService] getUserTickets is deprecated; use getUserTicketsPage');
  return getUserTicketsRepo(userId);
}

export async function fetchUserTicketsPage(opts: { limit?: number; before?: TicketListCursor | null; after?: TicketListCursor | null } = {}): Promise<TicketListPage> {
  return getUserTicketsPage(opts);
}

export type { TicketListCursor, TicketListPage };

export async function hasUserAcceptedBet(betId: string, userId: string): Promise<boolean> {
  return hasUserAcceptedBetRepo(betId, userId);
}

/**
 * Fetch mode overviews for a specific league.
 */
export async function fetchModeOverviews(league: League, force = false) {
  return fetchModeOverviewsRepo(league, force);
}

export async function fetchModePreview(
  modeKey: string,
  config: Record<string, unknown>,
  leagueGameId?: string | null,
  betId?: string | null,
  league: League = 'U2Pick',
) {
  return fetchModePreviewRepo(modeKey, config, leagueGameId, betId, league);
}

export async function fetchBetLiveInfo(betId: string): Promise<BetLiveInfo> {
  return fetchBetLiveInfoRepo(betId);
}

// Bet proposal configuration session helpers

export type BetConfigSessionStatus = 'mode_config' | 'general' | 'summary';

export type BetModeUserConfigChoice = {
  id: string;
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type BetModeUserConfigStep = {
  key: string;
  title: string;
  description?: string;
  validationErrors?: string[];
  selectedChoiceId?: string | null;
  completed?: boolean;
  choices: BetModeUserConfigChoice[];
};

export type BetModePreview = {
  summary: string;
  description: string;
  secondary?: string;
  options: string[];
  winningCondition?: string;
  errors?: string[];
};

export type BetGeneralConfigFieldSchema = {
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  choices: number[];
};

export type BetGeneralConfigSchema = {
  wager_amount: BetGeneralConfigFieldSchema;
  time_limit_seconds: BetGeneralConfigFieldSchema;
};

export type BetConfigSession = {
  session_id: string;
  mode_key: string;
  league_game_id: string;
  league: League;
  status: BetConfigSessionStatus;
  steps: BetModeUserConfigStep[];
  next_step: BetModeUserConfigStep | null;
  general: {
    wager_amount: number;
    time_limit_seconds: number;
  };
  general_schema: BetGeneralConfigSchema;
  preview: BetModePreview | null;
};

export type BetProposalBootstrap = {
  games?: { id: string; label: string }[];
  modes?: { key: string; label: string; supportedLeagues?: League[] }[];
  general_config_schema?: BetGeneralConfigSchema;
  league?: League;
};

/**
 * Fetch bootstrap data for bet proposal form (league-scoped, required).
 */
export async function fetchBetProposalBootstrap(league: League, signal?: AbortSignal): Promise<BetProposalBootstrap> {
  const url = `/api/bet-proposals/bootstrap/league/${encodeURIComponent(league)}`;
  return fetchJSON(url, { signal });
}

/**
 * Fetch games for a specific league.
 * This is a convenience wrapper around fetchBetProposalBootstrap.
 */
export async function fetchGamesForLeague(league: League, signal?: AbortSignal): Promise<{ id: string; label: string }[]> {
  const bootstrap = await fetchBetProposalBootstrap(league, signal);
  return bootstrap.games ?? [];
}

export type ActiveLeaguesResponse = {
  leagues: League[];
};

/**
 * Fetch active leagues from the server.
 * Returns leagues that have at least one registered mode.
 * U2Pick is always included (always "in season").
 */
export async function fetchActiveLeagues(signal?: AbortSignal): Promise<League[]> {
  const response = await fetchJSON<ActiveLeaguesResponse>('/api/leagues/active', { signal });
  return response?.leagues ?? [ 'U2Pick' ];
}

export async function createBetConfigSession(modeKey: string, leagueGameId: string, league: League = 'U2Pick'): Promise<BetConfigSession> {
  return fetchJSON('/api/bet-proposals/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode_key: modeKey, league_game_id: leagueGameId, league }),
  });
}

export async function applyBetConfigChoice(
  sessionId: string,
  stepKey: string,
  choiceId: string,
): Promise<BetConfigSession> {
  return fetchJSON(`/api/bet-proposals/sessions/${encodeURIComponent(sessionId)}/choices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step_key: stepKey, choice_id: choiceId }),
  });
}

export async function updateBetGeneralConfig(
  sessionId: string,
  general: { wager_amount: number; time_limit_seconds: number },
): Promise<BetConfigSession> {
  return fetchJSON(`/api/bet-proposals/sessions/${encodeURIComponent(sessionId)}/general`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(general),
  });
}
