import express, { Request, Response } from 'express';
import * as betController from '../controllers/betController';
import * as modeController from '../controllers/modeController';
import * as messageController from '../controllers/messageController';
import * as friendController from '../controllers/friendController';
import * as tableController from '../controllers/tableController';
import * as ticketController from '../controllers/ticketController';
import * as userController from '../controllers/userController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateBody, validateParams } from '../middleware/validateRequest';
import { idempotency } from '../middleware/idempotency';
import {
  tableIdParams,
  tableAndMemberParams,
  betIdParams,
  sessionIdParams,
  leagueModeKeyParams,
  leagueParams,
  friendRequestActionParams,
  friendUserIdParams,
  betProposalBootstrapParams,
  createBetProposalBody,
  validateBetBody,
  sendMessageBody,
  addFriendBody,
  createSessionBody,
  applySessionChoiceBody,
  updateSessionGeneralBody,
  updateBetModeConfigBody,
  batchModeConfigBody,
  modeUserConfigBody,
  modePreviewBody,
  createTableBody,
  addMemberBody,
  changeGuessBody,
  updateUsernameBody,
} from '../controllers/schemas';
import { getHealthStatus } from '../infrastructure/healthCheck';

const router = express.Router();

/**
 * GET /health
 *
 * Comprehensive health check endpoint.
 * Returns 200 if healthy, 503 if unhealthy.
 * Includes status of all dependencies (Redis, Supabase).
 */
router.get('/health', async (_req: Request, res: Response) => {
  const health = await getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Bet Proposals
router.get('/leagues/active', asyncHandler(modeController.listActiveLeagues));
router.get('/bet-proposals/bootstrap/league/:league', validateParams(betProposalBootstrapParams), asyncHandler(betController.getBetProposalBootstrap));
router.post('/tables/:tableId/bets', validateParams(tableIdParams), validateBody(createBetProposalBody), idempotency(), asyncHandler(betController.createBetProposal));
router.post('/bets/:betId/poke', validateParams(betIdParams), asyncHandler(betController.pokeBet));
router.post('/bets/:betId/validate', validateParams(betIdParams), validateBody(validateBetBody), asyncHandler(betController.validateBet));
router.get('/bets/:betId/live-info', validateParams(betIdParams), asyncHandler(betController.getBetLiveInfo));
router.post('/bets/:betId/accept', validateParams(betIdParams), asyncHandler(betController.acceptBet));
router.patch('/bets/:betId/guess', validateParams(betIdParams), validateBody(changeGuessBody), asyncHandler(betController.changeGuess));

// Tables
router.get('/tables', asyncHandler(tableController.listTables));
router.post('/tables', validateBody(createTableBody), asyncHandler(tableController.create));
router.post('/tables/:tableId/settle', validateParams(tableIdParams), asyncHandler(tableController.settle));
router.post('/tables/:tableId/members', validateParams(tableIdParams), validateBody(addMemberBody), asyncHandler(tableController.addTableMember));
router.delete('/tables/:tableId/members/:userId', validateParams(tableAndMemberParams), asyncHandler(tableController.removeTableMember));

// Sessions
router.post('/bet-proposals/sessions', validateBody(createSessionBody), asyncHandler(modeController.createSession));
router.get('/bet-proposals/sessions/:sessionId', validateParams(sessionIdParams), asyncHandler(modeController.getSession));
router.post('/bet-proposals/sessions/:sessionId/choices', validateParams(sessionIdParams), validateBody(applySessionChoiceBody), asyncHandler(modeController.applySessionChoice));
router.post('/bet-proposals/sessions/:sessionId/general', validateParams(sessionIdParams), validateBody(updateSessionGeneralBody), asyncHandler(modeController.updateSessionGeneral));

// Modes - League-scoped endpoints
router.get('/leagues/:league/modes', validateParams(leagueParams), asyncHandler(modeController.listModesForLeague));
router.get('/leagues/:league/modes/overviews', validateParams(leagueParams), asyncHandler(modeController.listModeOverviewsForLeague));
router.get('/leagues/:league/modes/:modeKey', validateParams(leagueModeKeyParams), asyncHandler(modeController.getModeDefinitionForLeague));
router.post('/leagues/:league/modes/:modeKey/user-config', validateParams(leagueModeKeyParams), validateBody(modeUserConfigBody), asyncHandler(modeController.getUserConfigStepsForLeague));
router.post('/leagues/:league/modes/:modeKey/preview', validateParams(leagueModeKeyParams), validateBody(modePreviewBody), asyncHandler(modeController.getModePreviewForLeague));

// Mode Configs
router.post('/bets/:betId/mode-config', validateParams(betIdParams), validateBody(updateBetModeConfigBody), asyncHandler(modeController.updateBetModeConfig));
router.get('/bets/:betId/mode-config', validateParams(betIdParams), asyncHandler(modeController.getBetModeConfig));
router.post('/mode-config/batch', validateBody(batchModeConfigBody), asyncHandler(modeController.getBatchModeConfigs));

// Messages (rate-limited)
router.post('/tables/:tableId/messages', requireAuth, validateParams(tableIdParams), validateBody(sendMessageBody), asyncHandler(messageController.sendMessage));
router.get('/tables/:tableId/messages', requireAuth, validateParams(tableIdParams), asyncHandler(messageController.listMessages));
router.get('/tables/:tableId/messages/rate-limit-status', requireAuth, validateParams(tableIdParams), asyncHandler(messageController.getRateLimitStatus));

// Tickets
router.get('/tickets', requireAuth, asyncHandler(ticketController.listTickets));

// Friends
router.post('/friends', requireAuth, validateBody(addFriendBody), asyncHandler(friendController.addFriend));
router.delete('/friends/:friendUserId', requireAuth, validateParams(friendUserIdParams), asyncHandler(friendController.removeFriend));
router.get('/friend-requests', requireAuth, asyncHandler(friendController.listFriendRequests));
router.post('/friend-requests/:requestId/:action', requireAuth, validateParams(friendRequestActionParams), asyncHandler(friendController.respondToFriendRequest));

// Users
router.patch('/users/me/username', requireAuth, validateBody(updateUsernameBody), asyncHandler(userController.updateUsername));

export default router;
