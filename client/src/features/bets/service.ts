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
