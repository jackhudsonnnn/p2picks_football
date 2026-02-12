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
  BetProposalError,
} from '../services/bet/betProposalService';
import { fetchModeConfig } from '../utils/modeConfig';
import { getRedisClient } from '../utils/redisClient';
import { createMessageRateLimiter } from '../utils/rateLimiter';
import { normalizeLeague } from '../types/league';
import { setRateLimitHeaders } from '../middleware/rateLimitHeaders';

// Lazy-initialize the rate limiter (shared with messages)
let sharedRateLimiter: ReturnType<typeof createMessageRateLimiter> | null = null;

function getSharedRateLimiter() {
  if (!sharedRateLimiter) {
    const redis = getRedisClient();
    sharedRateLimiter = createMessageRateLimiter(redis);
  }
  return sharedRateLimiter;
}

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

  // Check rate limit (shared with messages - bets count as messages)
  const rateLimiter = getSharedRateLimiter();
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

    // Check rate limit (shared with messages - pokes count as messages)
    const rateLimiter = getSharedRateLimiter();
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
      .select('bet_id, table_id, mode_key, league_game_id, league')
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
  } catch (e: any) {
    console.error('[betController] getBetLiveInfo error', { betId, error: e?.message });
    res.status(500).json({ error: e?.message || 'failed to fetch live info' });
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
      .select('bet_id, table_id, mode_key, league, bet_status, winning_choice')
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

    // Check bet status
    if (betRow.bet_status !== 'pending') {
      res.status(400).json({ 
        error: 'Bet cannot be validated',
        details: betRow.bet_status === 'active' 
          ? 'Bet is still active. Wait for the betting window to close.'
          : `Bet is already ${betRow.bet_status}.`
      });
      return;
    }

    // Check if already resolved
    if (betRow.winning_choice) {
      res.status(400).json({ error: 'Bet has already been validated' });
      return;
    }

    // Check if user is a participant in this bet
    const { data: participation, error: participationError } = await supabaseAdmin
      .from('bet_participations')
      .select('user_id')
      .eq('bet_id', betId)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (participationError) throw participationError;
    if (!participation) {
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

    // Set the winning choice - the DB trigger will handle the rest
    const { error: updateError } = await supabaseAdmin
      .from('bet_proposals')
      .update({ winning_choice: winningChoice })
      .eq('bet_id', betId)
      .eq('bet_status', 'pending')
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
      console.warn('[betController] failed to record validation history', { 
        betId, 
        error: (historyError as any)?.message 
      });
    }

    res.json({ 
      success: true, 
      bet_id: betId, 
      winning_choice: winningChoice,
      message: 'Bet validated successfully',
    });
  } catch (e: any) {
    console.error('[betController] validateBet error', { betId, error: e?.message });
    res.status(500).json({ error: e?.message || 'failed to validate bet' });
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
    console.error('[betController] membership check failed', {
      tableId,
      userId,
      error: membershipError.message,
    });
    return { status: 500, message: 'failed to validate table membership' };
  }

  if (!isMember) {
    return { status: 403, message: 'You must be a table member to perform this action' };
  }

  return null;
}

function handleBetError(res: Response, error: any, fallbackMessage: string): void {
  if (error instanceof BetProposalError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  const message = error?.message || fallbackMessage;
  let status = 500;

  if (/invalid mode config/i.test(message)) {
    status = 400;
  } else if (/mode .* not found/i.test(message)) {
    status = 404;
  }

  console.error('[betController] error', { error: message });
  res.status(status).json({ error: message });
}
