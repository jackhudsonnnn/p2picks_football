import express, { Request, Response } from 'express';
import * as betController from '../controllers/betController';
import * as modeController from '../controllers/modeController';

const router = express.Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Bet Proposals
router.get('/bet-proposals/bootstrap', betController.getBetProposalBootstrap);
router.post('/tables/:tableId/bets', betController.createBetProposal);
router.post('/bets/:betId/poke', betController.pokeBet);

// Sessions
router.post('/bet-proposals/sessions', modeController.createSession);
router.get('/bet-proposals/sessions/:sessionId', modeController.getSession);
router.post('/bet-proposals/sessions/:sessionId/choices', modeController.applySessionChoice);
router.post('/bet-proposals/sessions/:sessionId/general', modeController.updateSessionGeneral);

// Modes
router.get('/bet-modes', modeController.listModes);
router.get('/bet-modes/overviews', modeController.listModeOverviews);
router.get('/bet-modes/:modeKey', modeController.getModeDefinition);
router.post('/bet-modes/:modeKey/user-config', modeController.getUserConfigSteps);
router.post('/bet-modes/:modeKey/preview', modeController.getModePreview);

// Mode Configs
router.post('/bets/:betId/mode-config', modeController.updateBetModeConfig);
router.get('/bets/:betId/mode-config', modeController.getBetModeConfig);
router.post('/mode-config/batch', modeController.getBatchModeConfigs);

export default router;
