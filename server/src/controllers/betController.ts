import { Request, Response } from 'express';
import {
  getAvailableGames,
  getGameStatus,
} from '../services/gameDataService';
import { loadRefinedGame } from '../utils/gameData';
import { possessionTeamIdFromDoc } from '../modes/modules/chooseTheirFate/evaluator';
import { storeModeConfig, fetchModeConfig } from '../services/modeConfig';
import {
  buildModePreview,
  ensureModeKeyMatchesBet,
  prepareModeConfig,
  validateModeConfig,
} from '../services/modeRuntimeService';
import {
  GENERAL_CONFIG_SCHEMA,
  consumeModeConfigSession,
  type ConsumedModeConfigSession,
  normalizeTimeLimitSeconds,
  normalizeWagerAmount,
} from '../services/configSessionService';
import { registerBetLifecycle } from '../services/betLifecycleService';
import { createBetProposalAnnouncement, type BetAnnouncementResult } from '../services/betAnnouncementService';
import { getSupabaseAdmin, type BetProposal } from '../supabaseClient';
import { normalizeToHundredth } from '../utils/number';
import { fetchActivePokeChildren, recordBetPokeLink } from '../services/betPokeService';
import { getModeModule } from '../modes/registry';

export async function createBetProposal(req: Request, res: Response) {
  const { tableId } = req.params as any;
  if (!tableId || typeof tableId !== 'string') {
    res.status(400).json({ error: 'tableId required' });
    return;
  }

  const body = req.body || {};
  const proposerUserId = typeof body.proposer_user_id === 'string' ? body.proposer_user_id : '';
  let modeKey = typeof body.mode_key === 'string' ? body.mode_key : '';
  const nflGameIdRaw = body.nfl_game_id;
  let nflGameId =
    typeof nflGameIdRaw === 'string' && nflGameIdRaw.trim().length ? nflGameIdRaw.trim() : null;
  const sessionIdRaw = typeof body.config_session_id === 'string' ? body.config_session_id : '';
  const configSessionId = sessionIdRaw.trim();

  if (!proposerUserId) {
    res.status(400).json({ error: 'proposer_user_id required' });
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

  let consumedSession: ConsumedModeConfigSession | null = null;
  if (configSessionId) {
    try {
      consumedSession = consumeModeConfigSession(configSessionId);
      modeKey = consumedSession.modeKey;
      nflGameId = consumedSession.nflGameId;
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'invalid configuration session' });
      return;
    }
  }

  if (!modeKey) {
    res.status(400).json({ error: 'mode_key required' });
    return;
  }

  const wagerAmountRaw = Number(
    body.wager_amount ?? GENERAL_CONFIG_SCHEMA.wager_amount.defaultValue,
  );
  let wagerAmount = normalizeWagerAmount(normalizeToHundredth(wagerAmountRaw));
  const timeLimitSecondsRaw = Number(
    body.time_limit_seconds ?? GENERAL_CONFIG_SCHEMA.time_limit_seconds.defaultValue,
  );
  let timeLimitSeconds = normalizeTimeLimitSeconds(timeLimitSecondsRaw);

  const rawConfig = body.mode_config;
  let modeConfig =
    rawConfig && typeof rawConfig === 'object'
      ? { ...(rawConfig as Record<string, unknown>) }
      : {};

  if (consumedSession) {
    modeConfig = { ...consumedSession.config };
    wagerAmount = consumedSession.general.wager_amount;
    timeLimitSeconds = consumedSession.general.time_limit_seconds;
  }

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

  // Mode specific validation
  const modeModule = getModeModule(modeKey);
  if (modeModule?.validateProposal) {
    const gameIdForCheck = typeof modeConfig.nfl_game_id === 'string' && modeConfig.nfl_game_id.trim().length
      ? modeConfig.nfl_game_id.trim()
      : nflGameId;
      
    if (gameIdForCheck) {
      const validationResult = await modeModule.validateProposal({
        nflGameId: gameIdForCheck,
        config: modeConfig,
      });

      if (!validationResult.valid) {
        res.status(400).json({
          error: validationResult.error || 'Invalid bet proposal',
          details: validationResult.details,
        });
        return;
      }

      if (validationResult.configUpdates) {
        Object.assign(modeConfig, validationResult.configUpdates);
      }
    }
  }

  try {
    const validationErrors = await validateModeConfig(modeKey, modeConfig);
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

    let announcement: BetAnnouncementResult | null = null;
    try {
      announcement = await createBetProposalAnnouncement({ bet: typedBet, preview });
    } catch (announcementError) {
      console.error('[betProposal] failed to create proposal announcement', {
        betId: typedBet.bet_id,
        tableId: typedBet.table_id,
        error: (announcementError as any)?.message ?? announcementError,
      });
      await supabase.from('bet_proposals').delete().eq('bet_id', typedBet.bet_id);
      throw announcementError;
    }

    try {
      if (Object.keys(modeConfig).length > 0) {
        const prepared = await prepareModeConfig(modeKey, typedBet, modeConfig);
        await storeModeConfig(typedBet.bet_id, modeKey, prepared);
      }
    } catch (cfgError) {
      if (announcement?.systemMessageId) {
        try {
          await getSupabaseAdmin()
            .from('system_messages')
            .delete()
            .eq('system_message_id', announcement.systemMessageId);
        } catch (cleanupError) {
          console.warn('[betProposal] failed to clean up system message after config failure', {
            betId: typedBet.bet_id,
            systemMessageId: announcement.systemMessageId,
            error: (cleanupError as any)?.message ?? cleanupError,
          });
        }
      }
      await supabase.from('bet_proposals').delete().eq('bet_id', typedBet.bet_id);
      throw cfgError;
    }

    const closeTime = typeof (bet as any)?.close_time === 'string' ? (bet as any).close_time : null;
    registerBetLifecycle(typedBet.bet_id, closeTime);

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
}

export async function pokeBet(req: Request, res: Response) {
  const { betId } = req.params as any;
  if (!betId || typeof betId !== 'string') {
    res.status(400).json({ error: 'betId required' });
    return;
  }

  const supabase = req.supabase;
  const authUser = req.authUser;
  if (!supabase || !authUser) {
    res.status(500).json({ error: 'Authentication context missing' });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: betRow, error: betError } = await supabaseAdmin
      .from('bet_proposals')
      .select('*')
      .eq('bet_id', betId)
      .maybeSingle();
    if (betError) {
      throw betError;
    }
    if (!betRow) {
      res.status(404).json({ error: 'Bet not found' });
      return;
    }

    const sourceBet = betRow as BetProposal;
    if (sourceBet.bet_status !== 'resolved' && sourceBet.bet_status !== 'washed') {
      res.status(409).json({ error: 'Only resolved or washed bets can be poked' });
      return;
    }

    const { data: isMember, error: membershipError } = await supabase.rpc('is_user_member_of_table', {
      p_table_id: sourceBet.table_id,
      p_user_id: authUser.id,
    });
    if (membershipError) {
      console.error('[betPoke] membership check failed', {
        betId,
        tableId: sourceBet.table_id,
        userId: authUser.id,
        error: membershipError.message,
      });
      res.status(500).json({ error: 'failed to validate table membership' });
      return;
    }
    if (!isMember) {
      res.status(403).json({ error: 'You must be a table member to poke bets' });
      return;
    }

    let activeChildren: BetProposal[] = [];
    try {
      activeChildren = await fetchActivePokeChildren(sourceBet.bet_id);
    } catch (activeErr: any) {
      console.error('[betPoke] failed to inspect active pokes', {
        betId,
        error: activeErr?.message || activeErr,
      });
      res.status(500).json({ error: 'failed to inspect active pokes' });
      return;
    }
    if (activeChildren.length) {
      res.status(409).json({ error: 'This bet already has an active poke in progress.' });
      return;
    }

    let configRecord;
    try {
      configRecord = await fetchModeConfig(sourceBet.bet_id);
    } catch (cfgErr: any) {
      console.error('[betPoke] failed to load mode config', {
        betId,
        error: cfgErr?.message || cfgErr,
      });
      res.status(500).json({ error: 'failed to load bet configuration' });
      return;
    }
    if (!configRecord || configRecord.mode_key !== sourceBet.mode_key) {
      res.status(400).json({ error: 'This bet is not longer valid, please create a new bet manually' });
      return;
    }

    const modeConfig = { ...(configRecord.data ?? {}) } as Record<string, unknown>;
    const modeConfigAny = modeConfig as Record<string, any>;
    if (sourceBet.nfl_game_id && typeof sourceBet.nfl_game_id === 'string') {
      const configGameIdRaw = modeConfigAny?.nfl_game_id;
      const configGameId = typeof configGameIdRaw === 'string' ? configGameIdRaw.trim() : '';
      if (!configGameId.length) {
        modeConfigAny.nfl_game_id = sourceBet.nfl_game_id;
      }
    }

    const resolveAtNormalized =
      typeof modeConfigAny.resolve_at === 'string'
        ? (modeConfigAny.resolve_at as string).trim().toLowerCase()
        : '';
    if (sourceBet.mode_key === 'either_or' && resolveAtNormalized === 'halftime') {
      res.status(400).json({ error: 'This bet can not be poked.' });
      return;
    }

    let validationErrors: string[] = [];
    try {
      validationErrors = validateModeConfig(sourceBet.mode_key, modeConfig);
    } catch (validationErr: any) {
      const message = validationErr?.message || 'failed to validate poke configuration';
      const status = /mode .* not found/i.test(String(message)) ? 404 : 500;
      if (status === 404) {
        res.status(status).json({ error: message });
      } else {
        console.error('[betPoke] validateModeConfig failed', { betId, error: message });
        res.status(status).json({ error: 'failed to validate poke configuration' });
      }
      return;
    }
    if (validationErrors.length) {
      res.status(400).json({ error: 'This bet is not longer valid, please create a new bet manually' });
      return;
    }

    let preview;
    try {
      preview = await buildModePreview(sourceBet.mode_key, modeConfig, sourceBet);
    } catch (previewErr: any) {
      console.error('[betPoke] buildModePreview failed', {
        betId,
        error: previewErr?.message || previewErr,
      });
      res.status(500).json({ error: 'failed to build poke preview' });
      return;
    }
    if (!preview || preview.errors.length) {
      res.status(400).json({ error: 'This bet is not longer valid, please create a new bet manually' });
      return;
    }

  const wagerAmount = normalizeWagerAmount(normalizeToHundredth(sourceBet.wager_amount));
  const timeLimitSeconds = normalizeTimeLimitSeconds(sourceBet.time_limit_seconds);
    const description = preview.description || preview.summary || sourceBet.description || 'Bet';

    let insertedBet: BetProposal;
    try {
      const { data: newBet, error: insertError } = await supabase
        .from('bet_proposals')
        .insert([
          {
            table_id: sourceBet.table_id,
            proposer_user_id: authUser.id,
            nfl_game_id: sourceBet.nfl_game_id,
            mode_key: sourceBet.mode_key,
            description,
            wager_amount: wagerAmount,
            time_limit_seconds: timeLimitSeconds,
            bet_status: 'active',
          },
        ])
        .select()
        .single();
      if (insertError) throw insertError;
      insertedBet = newBet as BetProposal;
    } catch (insertErr: any) {
      console.error('[betPoke] failed to insert bet', {
        betId,
        error: insertErr?.message || insertErr,
      });
      res.status(500).json({ error: 'failed to create poked bet' });
      return;
    }

    let announcement: BetAnnouncementResult | null = null;
    try {
      announcement = await createBetProposalAnnouncement({ bet: insertedBet, preview });
    } catch (announcementError: any) {
      console.error('[betPoke] failed to create announcement', {
        sourceBetId: sourceBet.bet_id,
        newBetId: insertedBet.bet_id,
        error: announcementError?.message || announcementError,
      });
      await supabase.from('bet_proposals').delete().eq('bet_id', insertedBet.bet_id);
      res.status(500).json({ error: 'failed to create poked bet announcement' });
      return;
    }

    try {
      const prepared = await prepareModeConfig(insertedBet.mode_key, insertedBet, modeConfig);
      await storeModeConfig(insertedBet.bet_id, insertedBet.mode_key, prepared);
    } catch (cfgError: any) {
      if (announcement?.systemMessageId) {
        try {
          await getSupabaseAdmin()
            .from('system_messages')
            .delete()
            .eq('system_message_id', announcement.systemMessageId);
        } catch (cleanupError: any) {
          console.warn('[betPoke] failed to cleanup system message after config failure', {
            newBetId: insertedBet.bet_id,
            systemMessageId: announcement.systemMessageId,
            error: cleanupError?.message || cleanupError,
          });
        }
      }
      await supabase.from('bet_proposals').delete().eq('bet_id', insertedBet.bet_id);
      console.error('[betPoke] failed to store mode config', {
        sourceBetId: sourceBet.bet_id,
        newBetId: insertedBet.bet_id,
        error: cfgError?.message || cfgError,
      });
      res.status(500).json({ error: 'failed to store poked bet configuration' });
      return;
    }

    const closeTime = typeof (insertedBet as any)?.close_time === 'string' ? (insertedBet as any).close_time : null;
    registerBetLifecycle(insertedBet.bet_id, closeTime);

    try {
      await recordBetPokeLink(sourceBet.bet_id, insertedBet.bet_id);
    } catch (linkError: any) {
      console.error('[betPoke] failed to record poke link', {
        sourceBetId: sourceBet.bet_id,
        newBetId: insertedBet.bet_id,
        error: linkError?.message || linkError,
      });
    }

    res.json({
      bet: insertedBet,
      preview,
      origin_bet_id: sourceBet.bet_id,
      mode_config: modeConfig,
    });
  } catch (err: any) {
    console.error('[betPoke] unexpected error', {
      betId,
      userId: authUser.id,
      error: err?.message || err,
    });
    res.status(500).json({ error: 'failed to poke bet' });
  }
}

export async function getBetProposalBootstrap(_req: Request, res: Response) {
  try {
    const [gameMap] = await Promise.all([
      getAvailableGames(),
    ]);
    // We need to import listModeCatalog from modeCatalogService, but it's better to have a separate controller for modes
    // For now, I'll just return the games and let the client fetch modes separately or import it here.
    // Actually, let's import it.
    const { listModeCatalog } = await import('../services/modeCatalogService');
    const modeList = listModeCatalog();
    
    const games = Object.entries(gameMap).map(([id, label]) => ({ id, label }));
    res.json({ games, modes: modeList, general_config_schema: GENERAL_CONFIG_SCHEMA });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to load bet proposal bootstrap data' });
  }
}
