import express, { Request, Response } from 'express';
import * as betController from '../controllers/betController';
import * as modeController from '../controllers/modeController';
import * as messageController from '../controllers/messageController';
import * as friendController from '../controllers/friendController';
import * as tableController from '../controllers/tableController';
import * as ticketController from '../controllers/ticketController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
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
router.get('/bet-proposals/bootstrap/league/:league', asyncHandler(betController.getBetProposalBootstrap));
router.post('/tables/:tableId/bets', asyncHandler(betController.createBetProposal));
router.post('/bets/:betId/poke', asyncHandler(betController.pokeBet));
router.post('/bets/:betId/validate', asyncHandler(betController.validateBet));
router.get('/bets/:betId/live-info', asyncHandler(betController.getBetLiveInfo));

// Tables
router.get('/tables', asyncHandler(tableController.listTables));

// Sessions
router.post('/bet-proposals/sessions', asyncHandler(modeController.createSession));
router.get('/bet-proposals/sessions/:sessionId', asyncHandler(modeController.getSession));
router.post('/bet-proposals/sessions/:sessionId/choices', asyncHandler(modeController.applySessionChoice));
router.post('/bet-proposals/sessions/:sessionId/general', asyncHandler(modeController.updateSessionGeneral));

// Modes - League-scoped endpoints
router.get('/leagues/:league/modes', asyncHandler(modeController.listModesForLeague));
router.get('/leagues/:league/modes/overviews', asyncHandler(modeController.listModeOverviewsForLeague));
router.get('/leagues/:league/modes/:modeKey', asyncHandler(modeController.getModeDefinitionForLeague));
router.post('/leagues/:league/modes/:modeKey/user-config', asyncHandler(modeController.getUserConfigStepsForLeague));
router.post('/leagues/:league/modes/:modeKey/preview', asyncHandler(modeController.getModePreviewForLeague));

// Mode Configs
router.post('/bets/:betId/mode-config', asyncHandler(modeController.updateBetModeConfig));
router.get('/bets/:betId/mode-config', asyncHandler(modeController.getBetModeConfig));
router.post('/mode-config/batch', asyncHandler(modeController.getBatchModeConfigs));

// Messages (rate-limited)
router.post('/tables/:tableId/messages', requireAuth, asyncHandler(messageController.sendMessage));
router.get('/tables/:tableId/messages', requireAuth, asyncHandler(messageController.listMessages));
router.get('/tables/:tableId/messages/rate-limit-status', requireAuth, asyncHandler(messageController.getRateLimitStatus));

// Tickets
router.get('/tickets', requireAuth, asyncHandler(ticketController.listTickets));

// Friends
router.post('/friends', requireAuth, asyncHandler(friendController.addFriend));
router.get('/friend-requests', requireAuth, asyncHandler(friendController.listFriendRequests));
router.post('/friend-requests/:requestId/:action', requireAuth, asyncHandler(friendController.respondToFriendRequest));

export default router;
