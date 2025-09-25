import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  listAvailableGames,
  listPlayers,
  getModeDescription,
  getPlayerCategoryStats,
  getTeamCategoryStats,
  getGameTeams,
  getCurrentPossession,
  getTeamScoreStats,
} from './get-functioins';

const app = express();
const PORT = Number(process.env.PORT || 5001);

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// API routes
app.get('/api/games', async (_req: Request, res: Response) => {
  try {
    const games = await listAvailableGames();
    res.json(games);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to list games' });
  }
});

app.get('/api/games/:gameId/players', async (req: Request, res: Response) => {
  try {
    const players = await listPlayers(req.params.gameId);
    res.json(players);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to list players' });
  }
});

app.get('/api/modes/:mode', (req: Request, res: Response) => {
  res.json(getModeDescription(req.params.mode));
});

app.get('/api/games/:gameId/teams', async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params as any;
    const teams = await getGameTeams(gameId);
    res.json(teams);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to get teams' });
  }
});

// Place score-stats route BEFORE the generic team category route to avoid it being captured as a category.
app.get('/api/games/:gameId/team/:teamId/score-stats', async (req: Request, res: Response) => {
  try {
    const { gameId, teamId } = req.params as any;
    const start = Date.now();
    const data = await getTeamScoreStats(gameId, teamId);
    if (process.env.DEBUG_SCORE_STATS === '1' || process.env.DEBUG_SCORE_STATS === 'true') {
      console.log('[route:/score-stats] params', { gameId, teamId }, 'response', data, 'ms', Date.now() - start);
    }
    res.json(data);
  } catch (e: any) {
    if (process.env.DEBUG_SCORE_STATS === '1' || process.env.DEBUG_SCORE_STATS === 'true') {
      console.error('[route:/score-stats] error', e);
    }
    res.status(500).json({ error: e?.message || 'failed to get team score stats' });
  }
});

app.get('/api/games/:gameId/team/:teamId/:category', async (req: Request, res: Response) => {
  try {
    const { gameId, teamId, category } = req.params as any;
    const data = await getTeamCategoryStats(gameId, teamId, category as any);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to get team stats' });
  }
});

app.get('/api/games/:gameId/player/:playerId/:category', async (req: Request, res: Response) => {
  try {
    const { gameId, playerId, category } = req.params as any;
    const data = await getPlayerCategoryStats(gameId, playerId, category as any);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to get player stats' });
  }
});

app.get('/api/games/:gameId/possession', async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params as any;
    const pos = await getCurrentPossession(gameId);
    if (!pos) {
      res.status(404).json({ error: 'possession not available' });
      return;
    }
    res.json(pos);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to get possession' });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
