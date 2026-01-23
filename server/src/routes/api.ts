import express, { Request, Response } from 'express';
import * as betController from '../controllers/betController';
import * as modeController from '../controllers/modeController';
import * as messageController from '../controllers/messageController';
import * as friendController from '../controllers/friendController';
import * as tableController from '../controllers/tableController';
import * as ticketController from '../controllers/ticketController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Bet Proposals
router.get('/bet-proposals/bootstrap', betController.getBetProposalBootstrap);
router.post('/tables/:tableId/bets', betController.createBetProposal);
router.post('/bets/:betId/poke', betController.pokeBet);
router.get('/bets/:betId/live-info', betController.getBetLiveInfo);

// Tables
router.get('/tables', tableController.listTables);

// Sessions
router.post('/bet-proposals/sessions', modeController.createSession);
router.get('/bet-proposals/sessions/:sessionId', modeController.getSession);
router.post('/bet-proposals/sessions/:sessionId/choices', modeController.applySessionChoice);
router.post('/bet-proposals/sessions/:sessionId/general', modeController.updateSessionGeneral);

// Modes - League-scoped endpoints
router.get('/leagues/active', modeController.listActiveLeagues);
router.get('/leagues/:league/modes', modeController.listModesForLeague);
router.get('/leagues/:league/modes/overviews', modeController.listModeOverviewsForLeague);
router.get('/leagues/:league/modes/:modeKey', modeController.getModeDefinitionForLeague);
router.post('/leagues/:league/modes/:modeKey/user-config', modeController.getUserConfigStepsForLeague);
router.post('/leagues/:league/modes/:modeKey/preview', modeController.getModePreviewForLeague);

// Mode Configs
router.post('/bets/:betId/mode-config', modeController.updateBetModeConfig);
router.get('/bets/:betId/mode-config', modeController.getBetModeConfig);
router.post('/mode-config/batch', modeController.getBatchModeConfigs);

// Messages (rate-limited)
router.post('/tables/:tableId/messages', requireAuth, messageController.sendMessage);
router.get('/tables/:tableId/messages', requireAuth, messageController.listMessages);
router.get('/tables/:tableId/messages/rate-limit-status', requireAuth, messageController.getRateLimitStatus);

// Tickets
router.get('/tickets', requireAuth, ticketController.listTickets);

// Friends
router.post('/friends', requireAuth, friendController.addFriend);
router.get('/friend-requests', requireAuth, friendController.listFriendRequests);
router.post('/friend-requests/:requestId/:action', requireAuth, friendController.respondToFriendRequest);

export default router;
