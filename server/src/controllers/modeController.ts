import { Request, Response } from 'express';
import { 
  listModeDefinitions, 
  getModeDefinition as findModeDefinition, 
  listModeOverviews as getOverviewCatalog,
  ensureInitialized as ensureModeRegistryInitialized,
  getActiveLeagues as getActiveLeaguesFromRegistry,
  modeSupportsLeague,
} from '../modes';
import {
  buildModePreview,
  ensureModeKeyMatchesBet,
  getModeUserConfigSteps,
  prepareModeConfig,
} from '../services/bet/modeRuntimeService';
import {
  applyModeConfigChoice,
  createModeConfigSession,
  getModeConfigSession,
  setModeConfigGeneral,
} from '../services/bet/configSessionService';
import { fetchModeConfig, fetchModeConfigs, storeModeConfig } from '../utils/modeConfig';
import { BetProposal } from '../supabaseClient';
import { normalizeGameIdInConfig } from '../utils/gameId';
import { normalizeLeague, type League } from '../types/league';

// ─────────────────────────────────────────────────────────────────────────────
// League-scoped Mode Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/leagues/:league/modes
 * List all modes available for a specific league.
 */
export async function listModesForLeague(req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const leagueRaw = req.params.league;
  if (!leagueRaw) {
    res.status(400).json({ error: 'league parameter required' });
    return;
  }
  const league = normalizeLeague(leagueRaw);
  res.json(listModeDefinitions(league));
}

/**
 * GET /api/leagues/:league/modes/overviews
 * List mode overviews for a specific league.
 */
export async function listModeOverviewsForLeague(req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const leagueRaw = req.params.league;
  if (!leagueRaw) {
    res.status(400).json({ error: 'league parameter required' });
    return;
  }
  const league = normalizeLeague(leagueRaw);
  res.json(getOverviewCatalog(league));
}

/**
 * GET /api/leagues/active
 * Returns the list of leagues that have at least one registered mode.
 * U2Pick is always included since it's always "in season".
 */
export async function listActiveLeagues(_req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const activeLeagues = getActiveLeaguesFromRegistry();
  
  // Ensure U2Pick is always included (always in season)
  if (!activeLeagues.includes('U2Pick')) {
    activeLeagues.unshift('U2Pick');
  }
  
  res.json({
    leagues: activeLeagues,
  });
}

/**
 * GET /api/leagues/:league/modes/:modeKey
 * Get a specific mode definition, validating it supports the league.
 */
export async function getModeDefinitionForLeague(req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const leagueRaw = req.params.league;
  const { modeKey } = req.params;
  
  if (!leagueRaw) {
    res.status(400).json({ error: 'league parameter required' });
    return;
  }
  if (!modeKey) {
    res.status(400).json({ error: 'modeKey parameter required' });
    return;
  }
  
  const league = normalizeLeague(leagueRaw);
  const def = findModeDefinition(modeKey, league);
  
  if (!def) {
    res.status(404).json({ error: 'mode not found or does not support this league' });
    return;
  }
  res.json(def);
}

/**
 * POST /api/leagues/:league/modes/:modeKey/user-config
 * Get user configuration steps for a mode within a league context.
 */
export async function getUserConfigStepsForLeague(req: Request, res: Response) {
  try {
    await ensureModeRegistryInitialized();
    const leagueRaw = req.params.league;
    const { modeKey } = req.params;
    
    if (!leagueRaw) {
      res.status(400).json({ error: 'league parameter required' });
      return;
    }
    if (!modeKey) {
      res.status(400).json({ error: 'modeKey parameter required' });
      return;
    }
    
    const league = normalizeLeague(leagueRaw);
    
    // Validate mode supports this league
    if (!modeSupportsLeague(modeKey, league)) {
      res.status(404).json({ error: `mode '${modeKey}' does not support league '${league}'` });
      return;
    }
    
    const rawConfig = req.body?.config;
    const config =
      rawConfig && typeof rawConfig === 'object'
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    const leagueGameId = typeof req.body?.league_game_id === 'string'
      ? req.body.league_game_id
      : undefined;
    
    const steps = await getModeUserConfigSteps(modeKey, {
      leagueGameId,
      league,
      config,
    });
    res.json({ mode_key: modeKey, league, steps });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to build mode user config' });
  }
}

/**
 * POST /api/leagues/:league/modes/:modeKey/preview
 * Get a preview for a mode within a league context.
 */
export async function getModePreviewForLeague(req: Request, res: Response) {
  try {
    await ensureModeRegistryInitialized();
    const leagueRaw = req.params.league;
    const { modeKey } = req.params;
    
    if (!leagueRaw) {
      res.status(400).json({ error: 'league parameter required' });
      return;
    }
    if (!modeKey) {
      res.status(400).json({ error: 'modeKey parameter required' });
      return;
    }
    
    const league = normalizeLeague(leagueRaw);
    
    // Validate mode supports this league
    if (!modeSupportsLeague(modeKey, league)) {
      res.status(404).json({ error: `mode '${modeKey}' does not support league '${league}'` });
      return;
    }
    
    const rawConfig = req.body?.config;
    let config =
      rawConfig && typeof rawConfig === 'object'
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    const leagueGameId = typeof req.body?.league_game_id === 'string'
      ? req.body.league_game_id
      : undefined;
    
    // Normalize game ID in config
    if (leagueGameId) {
      config = normalizeGameIdInConfig(config, leagueGameId);
    }
    config.league = league;

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
    res.json({ mode_key: modeKey, league, ...preview, config });
  } catch (e: any) {
    const status = /mode .* not found/i.test(String(e?.message || '')) ? 404 : 500;
    res.status(status).json({ error: e?.message || 'failed to build mode preview' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy endpoints (kept for backward compat during transition, can be removed)
// ─────────────────────────────────────────────────────────────────────────────

export async function listModes(req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const leagueRaw = typeof req.query.league === 'string' ? req.query.league : undefined;
  const league = leagueRaw ? normalizeLeague(leagueRaw) : undefined;
  res.json(listModeDefinitions(league));
}

export async function listModeOverviews(req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const leagueRaw = typeof req.query.league === 'string' ? req.query.league : undefined;
  const league = leagueRaw ? normalizeLeague(leagueRaw) : undefined;
  res.json(getOverviewCatalog(league));
}

export async function getModeDefinition(req: Request, res: Response) {
  await ensureModeRegistryInitialized();
  const leagueRaw = typeof req.query.league === 'string' ? req.query.league : undefined;
  const league = leagueRaw ? normalizeLeague(leagueRaw) : undefined;
  const def = findModeDefinition(req.params.modeKey, league);
  if (!def) {
    res.status(404).json({ error: 'mode not found' });
    return;
  }
  res.json(def);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Endpoints (these already require league in body)
// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(req: Request, res: Response) {
  try {
    const modeKeyRaw = typeof req.body?.mode_key === 'string' ? req.body.mode_key : '';
    const modeKey = modeKeyRaw.trim();
    const leagueGameIdRaw = typeof req.body?.league_game_id === 'string'
      ? req.body.league_game_id
      : '';
    const leagueGameId = leagueGameIdRaw.trim();
    const leagueRaw = typeof req.body?.league === 'string' ? req.body.league : '';
    const league = leagueRaw.trim().toUpperCase();
    if (!modeKey) {
      res.status(400).json({ error: 'mode_key required' });
      return;
    }
    if (!leagueGameId) {
      res.status(400).json({ error: 'league_game_id required' });
      return;
    }
    if (!league) {
      res.status(400).json({ error: 'league required' });
      return;
    }
    const session = await createModeConfigSession({ modeKey, leagueGameId, league: league as any });
    res.json(session);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to create configuration session' });
  }
}

export async function getSession(req: Request, res: Response) {
  try {
    const sessionId = String((req.params as any)?.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }
    const session = await getModeConfigSession(sessionId);
    res.json(session);
  } catch (e: any) {
    const status = /not found|expired/i.test(String(e?.message || '')) ? 404 : 500;
    res.status(status).json({ error: e?.message || 'failed to fetch configuration session' });
  }
}

export async function applySessionChoice(req: Request, res: Response) {
  try {
    const sessionId = String((req.params as any)?.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }
    const stepKeyRaw = typeof req.body?.step_key === 'string' ? req.body.step_key : '';
    const choiceIdRaw = typeof req.body?.choice_id === 'string' ? req.body.choice_id : '';
    const stepKey = stepKeyRaw.trim();
    const choiceId = choiceIdRaw.trim();
    if (!stepKey || !choiceId) {
      res.status(400).json({ error: 'step_key and choice_id required' });
      return;
    }
    const session = await applyModeConfigChoice(sessionId, { stepKey, choiceId });
    res.json(session);
  } catch (e: any) {
    const status = /not available|not found|expired|no longer available/i.test(String(e?.message || '')) ? 400 : 500;
    res.status(status).json({ error: e?.message || 'failed to apply configuration choice' });
  }
}

export async function updateSessionGeneral(req: Request, res: Response) {
  try {
    const sessionId = String((req.params as any)?.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }
    const session = await setModeConfigGeneral(sessionId, {
      wager_amount: typeof req.body?.wager_amount === 'number' ? req.body.wager_amount : undefined,
      time_limit_seconds: typeof req.body?.time_limit_seconds === 'number' ? req.body.time_limit_seconds : undefined,
    });
    res.json(session);
  } catch (e: any) {
    const status = /complete mode configuration/i.test(String(e?.message || '')) ? 400 : 500;
    res.status(status).json({ error: e?.message || 'failed to update general configuration' });
  }
}

export async function getUserConfigSteps(req: Request, res: Response) {
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
    const leagueGameId = typeof req.body?.league_game_id === 'string'
      ? req.body.league_game_id
      : undefined;
    const leagueRaw = typeof req.body?.league === 'string' ? req.body.league : '';
    if (!leagueRaw) {
      res.status(400).json({ error: 'league required' });
      return;
    }
    const league = normalizeLeague(leagueRaw);
    const steps = await getModeUserConfigSteps(modeKey, {
      leagueGameId,
      league,
      config,
    });
    res.json({ mode_key: modeKey, steps });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to build mode user config' });
  }
}

export async function getModePreview(req: Request, res: Response) {
  try {
    const { modeKey } = req.params as any;
    if (!modeKey) {
      res.status(400).json({ error: 'modeKey required' });
      return;
    }
    const rawConfig = req.body?.config;
    let config =
      rawConfig && typeof rawConfig === 'object'
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    const leagueGameId = typeof req.body?.league_game_id === 'string'
      ? req.body.league_game_id
      : undefined;
    const leagueRaw = typeof req.body?.league === 'string' ? req.body.league : '';
    if (!leagueRaw) {
      res.status(400).json({ error: 'league required' });
      return;
    }
    const league = normalizeLeague(leagueRaw);
    // Normalize game ID in config
    if (leagueGameId) {
      config = normalizeGameIdInConfig(config, leagueGameId);
    }
    config.league = league;

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
}

export async function updateBetModeConfig(req: Request, res: Response) {
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
}

export async function getBetModeConfig(req: Request, res: Response) {
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
}

export async function getBatchModeConfigs(req: Request, res: Response) {
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
}
