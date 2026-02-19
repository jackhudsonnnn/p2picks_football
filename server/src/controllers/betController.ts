/**
 * Bet Controller - HTTP handlers for bet-related endpoints.
 * Delegates business logic to services.
 */

import { Request, Response } from 'express';
import { getAvailableGames } from '../services/leagueData';
import {
  listModeDefinitions,
  getModeLiveInfo,
  ensureInitialized as ensureModeRegistryInitialized,
} from '../leagues';
import { GENERAL_CONFIG_SCHEMA } from '../services/bet/configSessionService';
import {
  createBetProposal as createBetProposalService,
  pokeBet as pokeBetService,
} from '../services/bet/betProposalService';
import { fetchModeConfig } from '../utils/modeConfig';
import { getBetRateLimiter } from '../infrastructure/rateLimiters';
import { normalizeLeague } from '../types/league';
import { setRateLimitHeaders } from '../middleware/rateLimitHeaders';
import { AppError } from '../errors';
import { createLogger } from '../utils/logger';
import { captureLiveInfoSnapshot, LIVE_INFO_SNAPSHOT_EVENT } from '../leagues/sharedUtils/liveInfoSnapshot';

const logger = createLogger('betController');

/**
 * POST /api/tables/:tableId/bets
 * Create a new bet proposal.
 */
export async function createBetProposal(req: Request, res: Response) {
  const { tableId } = req.params as any;
  if (!tableId || typeof tableId !== 'string') {
    res.status(400).json({ error: 'tableId required' });
    return;
  }

  const body = req.body || {};
  const proposerUserId = typeof body.proposer_user_id === 'string' ? body.proposer_user_id : '';

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

  // Validate membership
  const membershipError = await validateTableMembership(supabase, tableId, authUser.id);
  if (membershipError) {
    res.status(membershipError.status).json({ error: membershipError.message });
    return;
  }

  // Check rate limit
  const rateLimiter = getBetRateLimiter();
  const rateLimitKey = `${authUser.id}:${tableId}`;
  const rateLimitResult = await rateLimiter.check(rateLimitKey);

  setRateLimitHeaders(res, rateLimitResult);

  if (!rateLimitResult.allowed) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: rateLimitResult.retryAfterSeconds,
      message: `You've sent too many messages/bets. Please wait ${rateLimitResult.retryAfterSeconds} seconds.`,
    });
    return;
  }

  try {
    const league = normalizeLeague(typeof body.league === 'string' ? body.league : 'U2Pick');
    const leagueGameIdRaw = typeof body.league_game_id === 'string'
      ? body.league_game_id
      : '-1';
    const leagueGameId = leagueGameIdRaw.trim() || null;

    const result = await createBetProposalService(
      {
        tableId,
        proposerUserId,
        modeKey: typeof body.mode_key === 'string' ? body.mode_key : undefined,
        leagueGameId,
        league,
        configSessionId: typeof body.config_session_id === 'string'
          ? body.config_session_id.trim()
          : undefined,
        wagerAmount: body.wager_amount,
        timeLimitSeconds: body.time_limit_seconds,
        modeConfig: body.mode_config && typeof body.mode_config === 'object'
          ? body.mode_config
          : undefined,
        // U2Pick-specific fields
        u2pickWinningCondition: typeof body.u2pick_winning_condition === 'string'
          ? body.u2pick_winning_condition
          : undefined,
        u2pickOptions: Array.isArray(body.u2pick_options)
          ? body.u2pick_options.filter((o: unknown) => typeof o === 'string')
          : undefined,
      },
      supabase,
    );

    res.json({
      bet: result.bet,
      preview: result.preview,
      mode_config: result.modeConfig,
    });
  } catch (e: any) {
    handleBetError(res, e, 'failed to create bet proposal');
  }
}

/**
 * POST /api/bets/:betId/poke
 * Poke (re-create) a resolved or washed bet.
 */
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
    // First fetch the bet to validate membership
    const { getSupabaseAdmin } = await import('../supabaseClient');
    const supabaseAdmin = getSupabaseAdmin();
    const { data: betRow, error: betError } = await supabaseAdmin
      .from('bet_proposals')
      .select('table_id')
      .eq('bet_id', betId)
      .maybeSingle();

    if (betError) throw betError;
    if (!betRow) {
      res.status(404).json({ error: 'Bet not found' });
      return;
    }

    // Validate membership
    const membershipError = await validateTableMembership(
      supabase,
      betRow.table_id,
      authUser.id,
    );
    if (membershipError) {
      res.status(membershipError.status).json({ error: membershipError.message });
      return;
    }

    // Check rate limit
    const rateLimiter = getBetRateLimiter();
    const rateLimitKey = `${authUser.id}:${betRow.table_id}`;
    const rateLimitResult = await rateLimiter.check(rateLimitKey);

    setRateLimitHeaders(res, rateLimitResult);

    if (!rateLimitResult.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfterSeconds,
        message: `You've sent too many messages/bets. Please wait ${rateLimitResult.retryAfterSeconds} seconds.`,
      });
      return;
    }

    const result = await pokeBetService(
      {
        sourceBetId: betId,
        proposerUserId: authUser.id,
      },
      supabase,
    );

    res.json({
      bet: result.bet,
      preview: result.preview,
      origin_bet_id: result.originBetId,
      mode_config: result.modeConfig,
    });
  } catch (e: any) {
    handleBetError(res, e, 'failed to poke bet');
  }
}

/**
 * GET /api/bets/:betId/live-info
 * Get live tracking info for a bet (mode-specific).
 */
export async function getBetLiveInfo(req: Request, res: Response) {
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
    const { getSupabaseAdmin } = await import('../supabaseClient');
    const supabaseAdmin = getSupabaseAdmin();
    const { data: betRow, error: betError } = await supabaseAdmin
      .from('bet_proposals')
      .select('bet_id, table_id, mode_key, league_game_id, league, bet_status')
      .eq('bet_id', betId)
      .maybeSingle();

    if (betError) throw betError;
    if (!betRow) {
      res.status(404).json({ error: 'Bet not found' });
      return;
    }

    // Validate membership
    const membershipError = await validateTableMembership(
      supabase,
      betRow.table_id,
      authUser.id,
    );
    if (membershipError) {
      res.status(membershipError.status).json({ error: membershipError.message });
      return;
    }

    // For settled bets, prefer the persisted snapshot from resolution_history
    if (betRow.bet_status === 'resolved' || betRow.bet_status === 'washed') {
      const { data: snapshot } = await supabaseAdmin
        .from('resolution_history')
        .select('payload')
        .eq('bet_id', betId)
        .eq('event_type', LIVE_INFO_SNAPSHOT_EVENT)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snapshot?.payload && typeof snapshot.payload === 'object') {
        res.json(snapshot.payload);
        return;
      }
      // Fall through to live data path as graceful degradation for
      // bets settled before this feature was deployed
    }

    const modeKey = betRow.mode_key as string | null;
    if (!modeKey) {
      res.status(400).json({ error: 'Bet has no associated mode' });
      return;
    }

    // Fetch mode config for this bet
    const modeConfig = await fetchModeConfig(betId);
    const config = modeConfig?.data ?? {};

    // Get live info from the mode
    const leagueGameId = (betRow.league_game_id as string | null) ?? null;
    // Legacy fallback: older bets may not have league set in database
    const league = (betRow.league as any) ?? 'NFL';

    const liveInfo = await getModeLiveInfo(modeKey, {
      betId,
      config,
      leagueGameId,
      league,
    });

    if (!liveInfo) {
      res.status(404).json({ error: 'Live info not available for this mode' });
      return;
    }

    res.json(liveInfo);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'failed to fetch live info';
    logger.error({ betId, error: message }, 'getBetLiveInfo error');
    res.status(500).json({ error: message });
  }
}

/**
 * POST /api/bets/:betId/validate
 * Validate a U2Pick/Table Talk bet by setting the winning choice.
 * Only available for pending U2Pick bets.
 */
export async function validateBet(req: Request, res: Response) {
  const { betId } = req.params as any;
  if (!betId || typeof betId !== 'string') {
    res.status(400).json({ error: 'betId required' });
    return;
  }

  const body = req.body || {};
  const winningChoice = typeof body.winning_choice === 'string' ? body.winning_choice.trim() : '';

  if (!winningChoice) {
    res.status(400).json({ error: 'winning_choice is required' });
    return;
  }

  const supabase = req.supabase;
  const authUser = req.authUser;
  if (!supabase || !authUser) {
    res.status(500).json({ error: 'Authentication context missing' });
    return;
  }

  try {
    const { getSupabaseAdmin } = await import('../supabaseClient');
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the bet
    const { data: betRow, error: betError } = await supabaseAdmin
      .from('bet_proposals')
      .select('bet_id, table_id, mode_key, league, bet_status, winning_choice, close_time, proposer_user_id')
      .eq('bet_id', betId)
      .maybeSingle();

    if (betError) throw betError;
    if (!betRow) {
      res.status(404).json({ error: 'Bet not found' });
      return;
    }

    // Check if this is a U2Pick bet
    if (betRow.league !== 'U2Pick') {
      res.status(400).json({ error: 'Only U2Pick bets can be manually validated' });
      return;
    }

    // Check if already resolved
    if (betRow.winning_choice) {
      res.status(400).json({ error: 'Bet has already been validated' });
      return;
    }

    // Check bet status — allow 'pending' directly, or 'active' if the close
    // time has already passed (the lifecycle queue may not have transitioned
    // the row yet).
    const closeTime = betRow.close_time ? new Date(betRow.close_time).getTime() : null;
    const isCloseTimePassed = closeTime !== null && Date.now() >= closeTime;

    if (betRow.bet_status === 'active' && !isCloseTimePassed) {
      res.status(400).json({
        error: 'Bet cannot be validated',
        details: 'Bet is still active. Wait for the betting window to close.',
      });
      return;
    }

    if (betRow.bet_status !== 'pending' && betRow.bet_status !== 'active') {
      res.status(400).json({
        error: 'Bet cannot be validated',
        details: `Bet is already ${betRow.bet_status}.`,
      });
      return;
    }

    // Check if user is a participant or the proposer of this bet
    const isProposer = betRow.proposer_user_id === authUser.id;
    let isParticipant = false;

    if (!isProposer) {
      const { data: participation, error: participationError } = await supabaseAdmin
        .from('bet_participations')
        .select('user_id')
        .eq('bet_id', betId)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (participationError) throw participationError;
      isParticipant = !!participation;
    }

    if (!isProposer && !isParticipant) {
      res.status(403).json({ error: 'Only participants can validate this bet' });
      return;
    }

    // Fetch mode config to validate the winning choice
    const modeConfig = await fetchModeConfig(betId);
    const config = modeConfig?.data as Record<string, unknown> | null;
    const validOptions = config?.options as string[] | undefined;

    if (!validOptions || !Array.isArray(validOptions)) {
      res.status(500).json({ error: 'Could not determine valid options for this bet' });
      return;
    }

    // Check if winning_choice is a valid option
    if (!validOptions.includes(winningChoice)) {
      res.status(400).json({ 
        error: 'Invalid winning choice',
        valid_options: validOptions,
      });
      return;
    }

    // Set the winning choice - the DB trigger will handle the rest.
    // Accept both 'pending' and 'active' (close-time expired) to avoid a race
    // with the lifecycle queue.
    const { error: updateError } = await supabaseAdmin
      .from('bet_proposals')
      .update({ winning_choice: winningChoice })
      .eq('bet_id', betId)
      .in('bet_status', ['pending', 'active'])
      .is('winning_choice', null);

    if (updateError) throw updateError;

    // Record validation in history
    try {
      await supabaseAdmin.from('resolution_history').insert({
        bet_id: betId,
        event_type: 'manual_validation',
        payload: {
          validated_by: authUser.id,
          winning_choice: winningChoice,
          validated_at: new Date().toISOString(),
        },
      });
    } catch (historyError) {
      // Log but don't fail the request
      logger.warn({ betId, error: (historyError as Error)?.message }, 'failed to record validation history');
    }

    // Fire-and-forget: capture live-info snapshot for the validated bet
    const betLeague = (betRow.league as string) ?? 'U2Pick';
    captureLiveInfoSnapshot({
      betId,
      modeKey: (betRow.mode_key as string) ?? 'table_talk',
      leagueGameId: null,
      league: betLeague as any,
      trigger: 'resolved',
      outcomeDetail: winningChoice,
    }).catch((err) => {
      logger.warn({ betId, error: (err as Error)?.message }, 'failed to capture validation snapshot');
    });

    res.json({ 
      success: true, 
      bet_id: betId, 
      winning_choice: winningChoice,
      message: 'Bet validated successfully',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'failed to validate bet';
    logger.error({ betId, error: message }, 'validateBet error');
    res.status(500).json({ error: message });
  }
}

/**
 * GET /api/bet-proposals/bootstrap/league/:league
 * Get bootstrap data for bet proposal form.
 */
export async function getBetProposalBootstrap(req: Request, res: Response) {
  try {
    // Ensure mode registry is initialized
    await ensureModeRegistryInitialized();

    // Require league in route param
    const leagueParam = typeof req.params.league === 'string' ? req.params.league.trim() : '';
    if (!leagueParam) {
      res.status(400).json({ error: 'league parameter is required' });
      return;
    }

    const league = normalizeLeague(leagueParam);

    // Modes and games are league-scoped. Prefer returning the same payload
    // shape for all leagues, including U2Pick, so clients can rely on server-
    // provided mode definitions and validation metadata.
    const modeList = listModeDefinitions(league);
    const gameMap = await getAvailableGames(league);
    const games = Object.entries(gameMap).map(([id, label]) => ({ id, label }));

    // For U2Pick, try to extract validation metadata from registered mode
    // definitions (e.g. the Table Talk mode exposes condition/option limits).
    let validation: Record<string, unknown> | undefined;
    if (league === 'U2Pick') {
      // Look for the first mode that exposes metadata we can map
      const src = modeList.find((m: any) => m?.metadata && Object.keys(m.metadata).length > 0);
      if (src && src.metadata) {
        const md = src.metadata as Record<string, any>;
        validation = {
          // Accept multiple possible metadata key names to be robust
          conditionMin: md.conditionMin ?? md.conditionMinLength ?? md.condition_min,
          conditionMax: md.conditionMax ?? md.conditionMaxLength ?? md.condition_max,
          optionMin: md.optionMin ?? md.optionMinLength ?? md.option_min,
          optionMax: md.optionMax ?? md.optionMaxLength ?? md.option_max,
          optionsMinCount: md.optionsMinCount ?? md.options_min_count ?? md.optionsMinCount,
          optionsMaxCount: md.optionsMaxCount ?? md.options_max_count ?? md.optionsMaxCount,
        };
      }
    }

    res.json({
      games,
      modes: modeList,
      general_config_schema: GENERAL_CONFIG_SCHEMA,
      league,
      ...(validation ? { validation } : {}),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed to load bet proposal bootstrap data' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MembershipCheckError {
  status: number;
  message: string;
}

async function validateTableMembership(
  supabase: any,
  tableId: string,
  userId: string,
): Promise<MembershipCheckError | null> {
  const { data: isMember, error: membershipError } = await supabase.rpc(
    'is_user_member_of_table',
    {
      p_table_id: tableId,
      p_user_id: userId,
    },
  );

  if (membershipError) {
    logger.error({ tableId, userId, error: membershipError.message }, 'membership check failed');
    return { status: 500, message: 'failed to validate table membership' };
  }

  if (!isMember) {
    return { status: 403, message: 'You must be a table member to perform this action' };
  }

  return null;
}

function handleBetError(res: Response, error: unknown, fallbackMessage: string): void {
  if (AppError.isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  let status = 500;

  if (/invalid mode config/i.test(message)) {
    status = 400;
  } else if (/mode .* not found/i.test(message)) {
    status = 404;
  }

  logger.error({ error: message }, 'bet operation failed');
  res.status(status).json({ error: message });
}
