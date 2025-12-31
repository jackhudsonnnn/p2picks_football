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

export async function fetchModeOverviews(force = false) {
  return fetchModeOverviewsRepo(force);
}

export async function fetchModePreview(
  modeKey: string,
  config: Record<string, unknown>,
  nflGameId?: string | null,
  betId?: string | null,
) {
  return fetchModePreviewRepo(modeKey, config, nflGameId, betId);
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
  nfl_game_id: string;
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
  modes?: { key: string; label: string }[];
  general_config_schema?: BetGeneralConfigSchema;
};

export async function fetchBetProposalBootstrap(signal?: AbortSignal): Promise<BetProposalBootstrap> {
  return fetchJSON('/api/bet-proposals/bootstrap', { signal });
}

export async function createBetConfigSession(modeKey: string, nflGameId: string): Promise<BetConfigSession> {
  return fetchJSON('/api/bet-proposals/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode_key: modeKey, nfl_game_id: nflGameId }),
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
