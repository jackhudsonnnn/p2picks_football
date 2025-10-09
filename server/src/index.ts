import express, { Request, Response } from 'express';
import cors from 'cors';
import 'dotenv/config';;
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
import { storeModeConfig, fetchModeConfig, fetchModeConfigs } from './services/modeConfig';
import { listModeCatalog, findModeDefinition } from './services/modeCatalogService';
import {
  buildModePreview,
  ensureModeKeyMatchesBet,
  getModeUserConfigSteps,
  prepareModeConfig,
  validateModeConfig,
} from './services/modeRuntimeService';
import { startModeValidators } from './services/modeValidatorService';
import type { BetProposal } from './supabaseClient';
import { getSupabase } from './supabaseClient';
import { normalizeToHundredth } from './utils/number';

const app = express();
const PORT = Number(process.env.PORT || 5001);

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/bet-proposals/bootstrap', async (_req: Request, res: Response) => {
  try {
    const [gameMap, modeList] = await Promise.all([
      listAvailableGames(),
      Promise.resolve(listModeCatalog()),
    ]);
    const games = Object.entries(gameMap).map(([id, label]) => ({ id, label }));
    res.json({ games, modes: modeList });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to load bet proposal bootstrap data' });
  }
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

app.get('/api/bet-modes', (_req: Request, res: Response) => {
  res.json(listModeCatalog());
});

app.get('/api/bet-modes/:modeKey', (req: Request, res: Response) => {
  const def = findModeDefinition(req.params.modeKey);
  if (!def) {
    res.status(404).json({ error: 'mode not found' });
    return;
  }
  res.json(def);
});

app.post('/api/bet-modes/:modeKey/user-config', async (req: Request, res: Response) => {
  try {
    const { modeKey } = req.params as any;
    if (!modeKey) {
      res.status(400).json({ error: 'modeKey required' });
      return;
    }
    const rawConfig = req.body?.config;
    const config =
      rawConfig && typeof rawConfig === 'object'
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    const nflGameId = typeof req.body?.nfl_game_id === 'string' ? req.body?.nfl_game_id : undefined;
    const steps = await getModeUserConfigSteps(modeKey, { nflGameId, config });
    res.json({ mode_key: modeKey, steps });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to build mode user config' });
  }
});

app.post('/api/bet-modes/:modeKey/preview', async (req: Request, res: Response) => {
  try {
    const { modeKey } = req.params as any;
    if (!modeKey) {
      res.status(400).json({ error: 'modeKey required' });
      return;
    }
    const rawConfig = req.body?.config;
    const config =
      rawConfig && typeof rawConfig === 'object'
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    const nflGameId = typeof req.body?.nfl_game_id === 'string' ? req.body?.nfl_game_id : undefined;
    if (nflGameId && !config.nfl_game_id) {
      config.nfl_game_id = nflGameId;
    }

    const preview = buildModePreview(modeKey, config);
    res.json({ mode_key: modeKey, ...preview, config });
  } catch (e: any) {
    const status = /mode .* not found/i.test(String(e?.message || '')) ? 404 : 500;
    res.status(status).json({ error: e?.message || 'failed to build mode preview' });
  }
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

app.post('/api/tables/:tableId/bets', async (req: Request, res: Response) => {
  const { tableId } = req.params as any;
  if (!tableId || typeof tableId !== 'string') {
    res.status(400).json({ error: 'tableId required' });
    return;
  }

  const body = req.body || {};
  const proposerUserId = typeof body.proposer_user_id === 'string' ? body.proposer_user_id : '';
  const modeKey = typeof body.mode_key === 'string' ? body.mode_key : '';
  const nflGameIdRaw = body.nfl_game_id;
  const nflGameId = typeof nflGameIdRaw === 'string' && nflGameIdRaw.length ? nflGameIdRaw : null;

  if (!proposerUserId) {
    res.status(400).json({ error: 'proposer_user_id required' });
    return;
  }
  if (!modeKey) {
    res.status(400).json({ error: 'mode_key required' });
    return;
  }

  const supabase = getSupabase();
  const wagerAmountRaw = Number(body.wager_amount ?? 0);
  const wagerAmount = clampWager(normalizeToHundredth(wagerAmountRaw));
  const timeLimitSecondsRaw = Number(body.time_limit_seconds ?? 30);
  const timeLimitSeconds = clampTimeLimit(timeLimitSecondsRaw);

  const rawConfig = body.mode_config;
  const modeConfig =
    rawConfig && typeof rawConfig === 'object'
      ? { ...(rawConfig as Record<string, unknown>) }
      : {};
  if (nflGameId && !modeConfig.nfl_game_id) {
    modeConfig.nfl_game_id = nflGameId;
  }

  try {
    const validationErrors = validateModeConfig(modeKey, modeConfig);
    if (validationErrors.length) {
      res.status(400).json({ error: 'invalid mode config', details: validationErrors });
      return;
    }

    const preview = buildModePreview(modeKey, modeConfig);
    if (preview.errors.length) {
      res.status(400).json({ error: 'invalid mode config', details: preview.errors });
      return;
    }

    const payload = {
      table_id: tableId,
      proposer_user_id: proposerUserId,
      nfl_game_id: nflGameId,
      mode_key: modeKey,
      description: preview.description || preview.summary || 'Bet',
      wager_amount: wagerAmount,
      time_limit_seconds: timeLimitSeconds,
      bet_status: 'active',
    };

    const { data: bet, error } = await supabase
      .from('bet_proposals')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;

    const typedBet = bet as BetProposal;

    try {
      if (Object.keys(modeConfig).length > 0) {
        const prepared = await prepareModeConfig(modeKey, typedBet, modeConfig);
        await storeModeConfig(typedBet.bet_id, modeKey, prepared);
      }
    } catch (cfgError) {
      await supabase.from('bet_proposals').delete().eq('bet_id', typedBet.bet_id);
      throw cfgError;
    }

    res.json({ bet: typedBet, preview, mode_config: modeConfig });
  } catch (e: any) {
    const message = e?.message || 'failed to create bet proposal';
    let status = 500;
    if (/invalid mode config/i.test(message)) {
      status = 400;
    } else if (/mode .* not found/i.test(message)) {
      status = 404;
    }
    res.status(status).json({ error: message });
  }
});

app.post('/api/bets/:betId/mode-config', async (req: Request, res: Response) => {
  try {
    const { betId } = req.params as any;
    const { mode_key: modeKeyRaw, data } = req.body || {};
    if (!betId || typeof betId !== 'string') {
      res.status(400).json({ error: 'betId required' });
      return;
    }
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'data object required' });
      return;
    }

    const requestedModeKey = typeof modeKeyRaw === 'string' && modeKeyRaw.length ? modeKeyRaw : undefined;
    const bet = await ensureModeKeyMatchesBet(betId, requestedModeKey);
    const resolvedModeKey = requestedModeKey || (bet.mode_key as string | null) || '';
    if (!resolvedModeKey) {
      res.status(400).json({ error: 'mode_key required' });
      return;
    }

  const prepared = await prepareModeConfig(resolvedModeKey, bet as BetProposal, data as Record<string, unknown>);
    await storeModeConfig(betId, resolvedModeKey, prepared);
    res.json({ ok: true, data: prepared });
  } catch (e: any) {
    const knownFailure = /mode_key mismatch|bet .* not found|mode_key missing/i.test(String(e?.message || ''));
    res
      .status(knownFailure ? 400 : 500)
      .json({ error: e?.message || 'failed to store mode config' });
  }
});

app.get('/api/bets/:betId/mode-config', async (req: Request, res: Response) => {
  try {
    const { betId } = req.params as any;
    if (!betId || typeof betId !== 'string') {
      res.status(400).json({ error: 'betId required' });
      return;
    }
    const config = await fetchModeConfig(betId);
    if (!config) {
      res.status(404).json({ error: 'mode config not found' });
      return;
    }
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to fetch mode config' });
  }
});

app.post('/api/mode-config/batch', async (req: Request, res: Response) => {
  try {
    const betIds: unknown = req.body?.betIds;
    if (!Array.isArray(betIds) || betIds.length === 0) {
      res.status(400).json({ error: 'betIds array required' });
      return;
    }
    const ids = betIds.filter((id) => typeof id === 'string') as string[];
    const configs = await fetchModeConfigs(ids);
    res.json(configs);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to fetch mode configs' });
  }
});

app.listen(PORT, () => {
  startModeValidators();
});

function clampWager(value: number): number {
  if (!Number.isFinite(value)) return 0.25;
  return Math.min(Math.max(value, 0.25), 5);
}

function clampTimeLimit(value: number): number {
  if (!Number.isFinite(value)) return 30;
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, 10), 60);
}
