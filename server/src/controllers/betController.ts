/**
 * Bet Controller - HTTP handlers for bet-related endpoints.
 * Delegates business logic to services.
 */

import { Request, Response } from 'express';
import { getAvailableGames } from '../services/nflData/nflRefinedDataAccessors';
import { listModeDefinitions, getModeLiveInfo } from '../modes/registry';
import { GENERAL_CONFIG_SCHEMA } from '../services/bet/configSessionService';
import {
  createBetProposal as createBetProposalService,
  pokeBet as pokeBetService,
  BetProposalError,
} from '../services/bet/betProposalService';
import { fetchModeConfig } from '../utils/modeConfig';
import { getRedisClient } from '../modes/shared/redisClient';
import { createMessageRateLimiter, type RateLimitResult } from '../utils/rateLimiter';
import { normalizeLeague, type League } from '../types/league';

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
 * Helper to set rate limit headers on the response.
 */
function setRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetInSeconds.toString());
  if (result.retryAfterSeconds !== null) {
    res.setHeader('Retry-After', result.retryAfterSeconds.toString());
  }
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
    const league = normalizeLeague(typeof body.league === 'string' ? body.league : 'NFL');
    const leagueGameIdRaw = typeof body.league_game_id === 'string'
      ? body.league_game_id
      : typeof body.nfl_game_id === 'string'
        ? body.nfl_game_id
        : '';
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
    const league = (betRow.league as any) ?? 'NFL';

    const liveInfo = await getModeLiveInfo(modeKey, {
      betId,
      config,
      leagueGameId,
      league,
      // Maintain legacy nflGameId alias for existing mode handlers
      nflGameId: league === 'NFL' ? leagueGameId : null,
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
 * GET /api/bet-proposals/bootstrap
 * Get bootstrap data for bet proposal form.
 */
export async function getBetProposalBootstrap(_req: Request, res: Response) {
  try {
    const gameMap = await getAvailableGames();
    const modeList = listModeDefinitions();

    const games = Object.entries(gameMap).map(([id, label]) => ({ id, label }));
    res.json({ games, modes: modeList, general_config_schema: GENERAL_CONFIG_SCHEMA });
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
