import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import 'dotenv/config';;
import {
  getAvailableGames,
  getGameStatus,
} from './services/gameDataService';
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
import { startNflGameStatusSync } from './services/nflGameStatusSyncService';
import type { BetProposal } from './supabaseClient';
import { normalizeToHundredth } from './utils/number';
import { requireAuth } from './middleware/auth';

assertRequiredEnv();

const app = express();
const apiRouter = express.Router();
const PORT = Number(process.env.PORT || 5001);

const corsOptions: CorsOptions = buildCorsOptions();
app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

apiRouter.get('/bet-proposals/bootstrap', async (_req: Request, res: Response) => {
  try {
    const [gameMap, modeList] = await Promise.all([
      getAvailableGames(),
      Promise.resolve(listModeCatalog()),
    ]);
    const games = Object.entries(gameMap).map(([id, label]) => ({ id, label }));
    res.json({ games, modes: modeList });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to load bet proposal bootstrap data' });
  }
});

apiRouter.get('/bet-modes', (_req: Request, res: Response) => {
  res.json(listModeCatalog());
});

apiRouter.get('/bet-modes/:modeKey', (req: Request, res: Response) => {
  const def = findModeDefinition(req.params.modeKey);
  if (!def) {
    res.status(404).json({ error: 'mode not found' });
    return;
  }
  res.json(def);
});

apiRouter.post('/bet-modes/:modeKey/user-config', async (req: Request, res: Response) => {
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

apiRouter.post('/bet-modes/:modeKey/preview', async (req: Request, res: Response) => {
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

    const betIdRaw = req.body?.bet_id;
    const betId = typeof betIdRaw === 'string' && betIdRaw.trim().length ? betIdRaw.trim() : undefined;

    let bet: BetProposal | null = null;
    if (betId) {
      try {
  bet = await ensureModeKeyMatchesBet(betId, modeKey, req.supabase);
      } catch (err: any) {
        console.warn('[modePreview] failed to ensure bet/mode alignment', {
          betId,
          modeKey,
          error: err?.message || String(err),
        });
      }
      if (!config.player1_id || !config.player2_id) {
        try {
          const stored = await fetchModeConfig(betId);
          if (stored && stored.mode_key === modeKey) {
            Object.assign(config, { ...stored.data, ...config });
          }
        } catch (err: any) {
          console.warn('[modePreview] failed to hydrate config from store', {
            betId,
            modeKey,
            error: err?.message || String(err),
          });
        }
      }
    }

  const preview = await buildModePreview(modeKey, config, bet);
    res.json({ mode_key: modeKey, ...preview, config });
  } catch (e: any) {
    const status = /mode .* not found/i.test(String(e?.message || '')) ? 404 : 500;
    res.status(status).json({ error: e?.message || 'failed to build mode preview' });
  }
});

apiRouter.post('/tables/:tableId/bets', async (req: Request, res: Response) => {
  const { tableId } = req.params as any;
  if (!tableId || typeof tableId !== 'string') {
    res.status(400).json({ error: 'tableId required' });
    return;
  }

  const body = req.body || {};
  const proposerUserId = typeof body.proposer_user_id === 'string' ? body.proposer_user_id : '';
  const modeKey = typeof body.mode_key === 'string' ? body.mode_key : '';
  const nflGameIdRaw = body.nfl_game_id;
  const nflGameId =
    typeof nflGameIdRaw === 'string' && nflGameIdRaw.trim().length ? nflGameIdRaw.trim() : null;

  if (!proposerUserId) {
    res.status(400).json({ error: 'proposer_user_id required' });
    return;
  }
  if (!modeKey) {
    res.status(400).json({ error: 'mode_key required' });
    return;
  }
  const supabase = req.supabase;
  const authUser = req.authUser;
  if (!supabase || !authUser) {
    res.status(500).json({ error: 'Authentication context missing' });
    return;
  }
  if (authUser.id !== proposerUserId) {
    res.status(403).json({ error: 'proposer_user_id must match authenticated user' });
    return;
  }

  const { data: isMember, error: membershipError } = await supabase.rpc('is_user_member_of_table', {
    p_table_id: tableId,
    p_user_id: authUser.id,
  });
  if (membershipError) {
    console.error('[betProposal] membership check failed', {
      tableId,
      userId: authUser.id,
      error: membershipError.message,
    });
    res.status(500).json({ error: 'failed to validate table membership' });
    return;
  }
  if (!isMember) {
    res.status(403).json({ error: 'You must be a table member to propose bets' });
    return;
  }

  const wagerAmountRaw = Number(body.wager_amount ?? 0);
  const wagerAmount = clampWager(normalizeToHundredth(wagerAmountRaw));
  const timeLimitSecondsRaw = Number(body.time_limit_seconds ?? 30);
  const timeLimitSeconds = clampTimeLimit(timeLimitSecondsRaw);

  const rawConfig = body.mode_config;
  const modeConfig =
    rawConfig && typeof rawConfig === 'object'
      ? { ...(rawConfig as Record<string, unknown>) }
      : {};
  let configGameId: string | null = null;
  if (typeof (modeConfig as any).nfl_game_id === 'string') {
    const trimmed = (modeConfig as any).nfl_game_id.trim();
    if (trimmed.length) {
      (modeConfig as any).nfl_game_id = trimmed;
      configGameId = trimmed;
    } else {
      delete (modeConfig as any).nfl_game_id;
    }
  }
  if (nflGameId && !configGameId) {
    (modeConfig as any).nfl_game_id = nflGameId;
    configGameId = nflGameId;
  }

  const gameIdsToCheck = new Set<string>();
  if (configGameId) gameIdsToCheck.add(configGameId);
  if (nflGameId) gameIdsToCheck.add(nflGameId);

  const gameStatusCache = new Map<string, string | null>();
  for (const gameId of gameIdsToCheck) {
    const status = await getGameStatus(gameId);
    gameStatusCache.set(gameId, status ?? null);
    console.log('Checking game status', { gameId, status });
    if (status === 'STATUS_FINAL') {
      res.status(400).json({
        error: 'Bets cannot be proposed for games that have already ended',
        details: { game_id: gameId, status: status ?? null },
      });
      return;
    }
  }

  if (modeKey === 'choose_their_fate') {
    const gameIdForCheck = typeof modeConfig.nfl_game_id === 'string' && modeConfig.nfl_game_id.trim().length
      ? modeConfig.nfl_game_id.trim()
      : null;
    if (!gameIdForCheck) {
      res.status(400).json({ error: 'Choose Their Fate requires an nfl_game_id' });
      return;
    }
    const rawStatus = gameStatusCache.has(gameIdForCheck)
      ? gameStatusCache.get(gameIdForCheck)
      : await getGameStatus(gameIdForCheck);
    const status = (rawStatus || '').trim().toUpperCase();
    if (status !== 'STATUS_IN_PROGRESS') {
      res.status(400).json({
        error: 'Choose Their Fate bets can only be proposed while the game is in progress',
        details: { game_id: gameIdForCheck, status: rawStatus ?? null },
      });
      return;
    }
  }

  try {
    const validationErrors = validateModeConfig(modeKey, modeConfig);
    if (validationErrors.length) {
      res.status(400).json({ error: 'invalid mode config', details: validationErrors });
      return;
    }

  const preview = await buildModePreview(modeKey, modeConfig);
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

apiRouter.post('/bets/:betId/mode-config', async (req: Request, res: Response) => {
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

    const supabase = req.supabase;
    if (!supabase) {
      res.status(500).json({ error: 'Authentication context missing' });
      return;
    }

    const requestedModeKey = typeof modeKeyRaw === 'string' && modeKeyRaw.length ? modeKeyRaw : undefined;
    const bet = await ensureModeKeyMatchesBet(betId, requestedModeKey, supabase);
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

apiRouter.get('/bets/:betId/mode-config', async (req: Request, res: Response) => {
  try {
    const { betId } = req.params as any;
    if (!betId || typeof betId !== 'string') {
      res.status(400).json({ error: 'betId required' });
      return;
    }
    const supabase = req.supabase;
    if (!supabase) {
      res.status(500).json({ error: 'Authentication context missing' });
      return;
    }
    try {
      await ensureModeKeyMatchesBet(betId, undefined, supabase);
    } catch (authErr: any) {
      const message = String(authErr?.message || 'bet not found');
      const status = /not found/i.test(message) ? 404 : 403;
      res.status(status).json({ error: status === 404 ? 'bet not found' : 'access denied' });
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

apiRouter.post('/mode-config/batch', async (req: Request, res: Response) => {
  try {
    const betIds: unknown = req.body?.betIds;
    if (!Array.isArray(betIds) || betIds.length === 0) {
      res.status(400).json({ error: 'betIds array required' });
      return;
    }
    const supabase = req.supabase;
    if (!supabase) {
      res.status(500).json({ error: 'Authentication context missing' });
      return;
    }
    const ids = betIds.filter((id) => typeof id === 'string') as string[];
    const { data, error } = await supabase
      .from('bet_proposals')
      .select('bet_id')
      .in('bet_id', ids);
    if (error) {
      console.error('[modeConfigBatch] failed to list accessible bets', error.message);
      res.status(500).json({ error: 'failed to validate bet access' });
      return;
    }
    const allowedIds = new Set((data ?? []).map((row: any) => row.bet_id).filter(Boolean));
    const filteredIds = ids.filter((id) => allowedIds.has(id));
    if (!filteredIds.length) {
      res.json({});
      return;
    }
    const configs = await fetchModeConfigs(filteredIds);
    res.json(configs);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to fetch mode configs' });
  }
});

app.use('/api', requireAuth, apiRouter);

app.listen(PORT, () => {
  startModeValidators();
  startNflGameStatusSync();
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

function assertRequiredEnv(): void {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!process.env.REDIS_URL) missing.push('REDIS_URL');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

function buildCorsOptions(): CorsOptions {
  const allowedOrigins = resolveAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const allowAll = allowedOrigins.has('*');

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowAll || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  };
}

function resolveAllowedOrigins(raw: string | undefined): Set<string> {
  if (raw && raw.trim().length) {
    return new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  }
  return new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
}
