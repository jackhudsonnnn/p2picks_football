import {
  createBetProposal as createBetProposalRepo,
  pokeBet as pokeBetRepo,
  acceptBetProposal as acceptBetProposalRepo,
  getUserTickets as getUserTicketsRepo,
  hasUserAcceptedBet as hasUserAcceptedBetRepo,
  type BetProposalRequestPayload,
} from '@data/repositories/betsRepository';
import {
  fetchModeOverviews as fetchModeOverviewsRepo,
  fetchModePreview as fetchModePreviewRepo,
  type ModePreviewPayload,
} from '@data/repositories/modesRepository';

export type { BetProposalRequestPayload };
export type { ModePreviewPayload };

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
  return getUserTicketsRepo(userId);
}

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
