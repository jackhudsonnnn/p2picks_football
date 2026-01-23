/**
 * BetProposalService - Handles the core business logic for creating and managing bet proposals.
 * Extracted from betController.ts to decouple business logic from HTTP handling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, type BetProposal } from '../../supabaseClient';
import { getGameStatus } from '../leagueData';
import { storeModeConfig, fetchModeConfig } from '../../utils/modeConfig';
import {
  buildModePreview,
  prepareModeConfig,
  validateModeConfig,
  type ModePreviewResult,
} from './modeRuntimeService';
import {
  consumeModeConfigSession,
  normalizeTimeLimitSeconds,
  normalizeWagerAmount,
  type ConsumedModeConfigSession,
} from './configSessionService';
import { registerBetLifecycle } from './betLifecycleService';
import { createBetProposalAnnouncement, type BetAnnouncementResult } from './betAnnouncementService';
import { fetchActivePokeChildren, recordBetPokeLink } from './betPokeService';
import { getMode, ensureInitialized as ensureModeRegistryInitialized } from '../../modes';
import { normalizeToHundredth } from '../../utils/number';
import { normalizeLeague, type League } from '../../types/league';
import {
  extractGameId,
  normalizeGameIdInConfig as normalizeGameIdUtil,
} from '../../utils/gameId';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CreateBetProposalInput {
  tableId: string;
  proposerUserId: string;
  modeKey: string;
  leagueGameId: string;
  league: League;
  configSessionId?: string;
  wagerAmount: number;
  timeLimitSeconds: number;
  modeConfig?: Record<string, unknown>;
  // U2Pick-specific
  u2pickWinningCondition?: string;
  u2pickOptions?: string[];
}

export interface CreateBetProposalResult {
  bet: BetProposal;
  preview: ModePreviewResult;
  modeConfig: Record<string, unknown>;
}

export interface PokeBetInput {
  sourceBetId: string;
  proposerUserId: string;
}

export interface PokeBetResult {
  bet: BetProposal;
  preview: ModePreviewResult;
  originBetId: string;
  modeConfig: Record<string, unknown>;
}

export class BetProposalError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BetProposalError';
  }

  static badRequest(message: string, details?: unknown): BetProposalError {
    return new BetProposalError(message, 400, details);
  }

  static forbidden(message: string): BetProposalError {
    return new BetProposalError(message, 403);
  }

  static notFound(message: string): BetProposalError {
    return new BetProposalError(message, 404);
  }

  static conflict(message: string): BetProposalError {
    return new BetProposalError(message, 409);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new bet proposal.
 */
export async function createBetProposal(
  input: CreateBetProposalInput,
  supabase: SupabaseClient,
): Promise<CreateBetProposalResult> {
  let league: League = normalizeLeague(input.league);

  // U2Pick has a completely different flow
  if (league === 'U2Pick' || input.modeKey === 'u2pick') {
    return createU2PickBetProposal(input, supabase);
  }

  // Process session if provided
  let consumedSession: ConsumedModeConfigSession | null = null;
  let modeKey = input.modeKey;
  let leagueGameId = input.leagueGameId;

  if (input.configSessionId) {
    try {
      consumedSession = consumeModeConfigSession(input.configSessionId);
      modeKey = consumedSession.modeKey;
      leagueGameId = consumedSession.leagueGameId;
      league = consumedSession.league;
    } catch (err: any) {
      throw BetProposalError.badRequest(err?.message || 'invalid configuration session');
    }
  }

  if (!modeKey) {
    throw BetProposalError.badRequest('mode_key required');
  }

  // Normalize wager and time limit
  let wagerAmount = normalizeWagerAmount(
    normalizeToHundredth(input.wagerAmount),
  );
  let timeLimitSeconds = normalizeTimeLimitSeconds(input.timeLimitSeconds);

  // Build mode config
  let modeConfig: Record<string, unknown> = input.modeConfig
    ? { ...input.modeConfig }
    : {};

  if (consumedSession) {
    modeConfig = { ...consumedSession.config };
    wagerAmount = consumedSession.general.wager_amount;
    timeLimitSeconds = consumedSession.general.time_limit_seconds;
  }

  // Ensure game/league identifiers are carried in config
  modeConfig.league = league;
  modeConfig.league_game_id = leagueGameId;
  // Normalize game ID in config
  modeConfig = normalizeGameIdUtil(modeConfig, leagueGameId);
  const configGameId = extractGameId(modeConfig);

  // Validate game status
  await validateGameStatus(configGameId, leagueGameId, league);

  // Run mode-specific validation
  await runModeSpecificValidation(modeKey, modeConfig, leagueGameId, league);

  // Validate mode config
  const validationErrors = validateModeConfig(modeKey, modeConfig);
  if (validationErrors.length) {
    throw BetProposalError.badRequest('invalid mode config', validationErrors);
  }

  // Build preview
  const preview = await buildModePreview(modeKey, modeConfig);
  if (preview.errors.length) {
    throw BetProposalError.badRequest('invalid mode config', preview.errors);
  }

  // Insert bet
  const betPayload = {
    table_id: input.tableId,
    proposer_user_id: input.proposerUserId,
    league_game_id: leagueGameId,
    league,
    mode_key: modeKey,
    description: preview.description || 'Bet',
    wager_amount: wagerAmount,
    time_limit_seconds: timeLimitSeconds,
    bet_status: 'active',
  };

  const { data: bet, error } = await supabase
    .from('bet_proposals')
    .insert([betPayload])
    .select()
    .single();

  if (error) throw error;
  const typedBet = bet as BetProposal;

  // Post-creation steps with cleanup on failure
  try {
    const announcement = await createAnnouncementWithCleanup(typedBet, preview, supabase);
    await storeModeConfigWithCleanup(typedBet, modeKey, modeConfig, announcement, supabase);
  } catch (err) {
    // Cleanup is handled in the helper functions
    throw err;
  }

  // Register lifecycle
  const closeTime = (bet as any)?.close_time ?? null;
  registerBetLifecycle(typedBet.bet_id, closeTime);

  return { bet: typedBet, preview, modeConfig };
}

/**
 * Pokes (re-creates) an existing resolved/washed bet.
 */
export async function pokeBet(
  input: PokeBetInput,
  supabase: SupabaseClient,
): Promise<PokeBetResult> {
  const supabaseAdmin = getSupabaseAdmin();

  // Fetch source bet
  const { data: betRow, error: betError } = await supabaseAdmin
    .from('bet_proposals')
    .select('*')
    .eq('bet_id', input.sourceBetId)
    .maybeSingle();

  if (betError) throw betError;
  if (!betRow) {
    throw BetProposalError.notFound('Bet not found');
  }

  const sourceBet = betRow as BetProposal;

  // Validate bet can be poked
  if (sourceBet.bet_status !== 'resolved' && sourceBet.bet_status !== 'washed') {
    throw BetProposalError.conflict('Only resolved or washed bets can be poked');
  }

  // Check for existing active pokes
  const activeChildren = await fetchActivePokeChildren(sourceBet.bet_id);
  if (activeChildren.length) {
    throw BetProposalError.conflict('This bet already has an active poke in progress.');
  }

  // Load and validate config
  const configRecord = await fetchModeConfig(sourceBet.bet_id);
  if (!configRecord || configRecord.mode_key !== sourceBet.mode_key) {
    throw BetProposalError.badRequest(
      'This bet is no longer valid, please create a new bet manually',
    );
  }

  const modeConfig = buildPokeConfig(configRecord.data ?? {}, sourceBet);

  // Check poke restrictions
  validatePokeRestrictions(sourceBet, modeConfig);

  // Validate mode config
  const validationErrors = validateModeConfig(sourceBet.mode_key, modeConfig);
  if (validationErrors.length) {
    throw BetProposalError.badRequest(
      'This bet is no longer valid, please create a new bet manually',
    );
  }

  // Build preview
  const preview = await buildModePreview(sourceBet.mode_key, modeConfig, sourceBet);
  if (!preview || preview.errors.length) {
    throw BetProposalError.badRequest(
      'This bet is no longer valid, please create a new bet manually',
    );
  }

  // Prepare new bet data
  const wagerAmount = normalizeWagerAmount(normalizeToHundredth(sourceBet.wager_amount));
  const timeLimitSeconds = normalizeTimeLimitSeconds(sourceBet.time_limit_seconds);
  const description = preview.description || sourceBet.description || 'Bet';

  // Insert new bet
  const { data: newBet, error: insertError } = await supabase
    .from('bet_proposals')
    .insert([
      {
        table_id: sourceBet.table_id,
        proposer_user_id: input.proposerUserId,
        league_game_id: sourceBet.league_game_id,
        league: sourceBet.league,
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
  const insertedBet = newBet as BetProposal;

  // Post-creation steps with cleanup
  try {
    const announcement = await createAnnouncementWithCleanup(insertedBet, preview, supabase);
    await storeModeConfigWithCleanup(
      insertedBet,
      insertedBet.mode_key,
      modeConfig,
      announcement,
      supabase,
    );
  } catch (err) {
    throw err;
  }

  // Register lifecycle and record link
  const closeTime = (insertedBet as any)?.close_time ?? null;
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

  return {
    bet: insertedBet,
    preview,
    originBetId: sourceBet.bet_id,
    modeConfig,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

async function validateGameStatus(
  configGameId: string | null,
  leagueGameId: string,
  league: League,
): Promise<void> {
  const gameIdsToCheck = new Set<string>();
  if (configGameId) gameIdsToCheck.add(configGameId);
  if (leagueGameId) gameIdsToCheck.add(leagueGameId);

  for (const gameId of gameIdsToCheck) {
    const status = await getGameStatus(league, gameId);
    if (status === 'STATUS_FINAL') {
      throw BetProposalError.badRequest(
        'Bets cannot be proposed for games that have already ended',
        { game_id: gameId, status },
      );
    }
  }
}

async function runModeSpecificValidation(
  modeKey: string,
  modeConfig: Record<string, unknown>,
  leagueGameId: string,
  league: League,
): Promise<void> {
  await ensureModeRegistryInitialized();
  const result = getMode(modeKey, league);
  if (!result.found || !result.module?.validateProposal) return;

  const gameIdForCheck = extractGameId(modeConfig) ?? leagueGameId;

  if (!gameIdForCheck) return;

  const validationResult = await result.module.validateProposal({
    leagueGameId: gameIdForCheck,
    league,
    config: modeConfig,
  });

  if (!validationResult.valid) {
    throw BetProposalError.badRequest(
      validationResult.error || 'Invalid bet proposal',
      validationResult.details,
    );
  }

  if (validationResult.configUpdates) {
    Object.assign(modeConfig, validationResult.configUpdates);
  }
}

function buildPokeConfig(
  existingData: Record<string, unknown>,
  sourceBet: BetProposal,
): Record<string, unknown> {
  // Normalize game ID in config, setting from bet if not present
  return normalizeGameIdUtil(existingData, sourceBet.league_game_id ?? undefined);
}

function validatePokeRestrictions(
  sourceBet: BetProposal,
  modeConfig: Record<string, unknown>,
): void {
  const resolveAtNormalized =
    typeof (modeConfig as any).resolve_at === 'string'
      ? (modeConfig as any).resolve_at.trim().toLowerCase()
      : '';

  if (sourceBet.mode_key === 'either_or' && resolveAtNormalized === 'halftime') {
    throw BetProposalError.badRequest('This bet cannot be poked.');
  }
}

async function createAnnouncementWithCleanup(
  bet: BetProposal,
  preview: ModePreviewResult,
  supabase: SupabaseClient,
): Promise<BetAnnouncementResult> {
  try {
    return await createBetProposalAnnouncement({ bet, preview });
  } catch (announcementError) {
    console.error('[betProposal] failed to create announcement', {
      betId: bet.bet_id,
      tableId: bet.table_id,
      error: (announcementError as any)?.message ?? announcementError,
    });
    await supabase.from('bet_proposals').delete().eq('bet_id', bet.bet_id);
    throw announcementError;
  }
}

async function storeModeConfigWithCleanup(
  bet: BetProposal,
  modeKey: string,
  modeConfig: Record<string, unknown>,
  announcement: BetAnnouncementResult | null,
  supabase: SupabaseClient,
): Promise<void> {
  if (Object.keys(modeConfig).length === 0) return;

  try {
    const prepared = await prepareModeConfig(modeKey, bet, modeConfig);
    await storeModeConfig(bet.bet_id, modeKey, prepared);
  } catch (cfgError) {
    console.error('[betProposal] failed to store mode config', {
      betId: bet.bet_id,
      error: (cfgError as any)?.message ?? cfgError,
    });

    // Cleanup announcement
    if (announcement?.systemMessageId) {
      try {
        await getSupabaseAdmin()
          .from('system_messages')
          .delete()
          .eq('system_message_id', announcement.systemMessageId);
      } catch (cleanupError) {
        console.warn('[betProposal] failed to cleanup system message', {
          betId: bet.bet_id,
          systemMessageId: announcement.systemMessageId,
          error: (cleanupError as any)?.message ?? cleanupError,
        });
      }
    }

    // Cleanup bet
    await supabase.from('bet_proposals').delete().eq('bet_id', bet.bet_id);
    throw cfgError;
  }
}

/**
 * Creates a U2Pick bet proposal - a custom user-defined bet with arbitrary options.
 * U2Pick bets bypass the modes system entirely since they're fully user-defined.
 */
async function createU2PickBetProposal(
  input: CreateBetProposalInput,
  supabase: SupabaseClient,
): Promise<CreateBetProposalResult> {
  const { tableId, proposerUserId, wagerAmount, timeLimitSeconds, u2pickWinningCondition, u2pickOptions } = input;

  // Validation
  if (!u2pickWinningCondition || u2pickWinningCondition.trim().length < 4) {
    throw new BetProposalError('U2Pick winning condition must be at least 4 characters', 400);
  }

  if (!u2pickOptions || u2pickOptions.length < 2 || u2pickOptions.length > 6) {
    throw new BetProposalError('U2Pick requires between 2 and 6 options', 400);
  }
  
  for (const opt of u2pickOptions) {
    if (!opt || opt.trim().length < 1 || opt.trim().length > 40) {
      throw new BetProposalError('Each U2Pick option must be between 1 and 40 characters', 400);
    }
  }

  // Build description and preview from user inputs
  const description = 'Custom Input';
  const winningCondition = u2pickWinningCondition.trim();

  // Normalize wager and time limit
  const normalizedWager = normalizeWagerAmount(wagerAmount);
  const normalizedTimeLimit = normalizeTimeLimitSeconds(timeLimitSeconds);

  // Insert bet proposal (U2Pick bypasses mode/runtime system)
  const { data: bet, error: betError } = await supabase
    .from('bet_proposals')
    .insert({
      table_id: tableId,
      proposer_user_id: proposerUserId,
      league_game_id: -1, // numeric placeholder to satisfy NOT NULL (bigint) in supabase
      league: 'U2Pick',
      mode_key: 'table_talk',
      description,
      wager_amount: normalizedWager,
      time_limit_seconds: normalizedTimeLimit,
      bet_status: 'active',
    })
    .select('*')
    .single();

  if (betError || !bet) {
    console.error('[betProposal] failed to insert U2Pick bet', betError);
    throw new BetProposalError('Failed to create U2Pick bet proposal', 500, betError);
  }

  const typedBet = bet as BetProposal;

  // U2Pick config to store
  const u2pickConfig: Record<string, unknown> = {
    winning_condition: winningCondition,
    options: u2pickOptions.map((o) => o.trim()),
  };

  // Build preview result
  const preview: ModePreviewResult = {
    description,
    options: u2pickOptions.map((o) => o.trim()),
    winningCondition,
    errors: [],
  };

  // Create announcement
  try {
    await createBetProposalAnnouncement({ bet: typedBet, preview });
  } catch (announcementError) {
    console.error('[betProposal] failed to create U2Pick announcement', {
      betId: typedBet.bet_id,
      error: (announcementError as any)?.message ?? announcementError,
    });
    await supabase.from('bet_proposals').delete().eq('bet_id', typedBet.bet_id);
    throw announcementError;
  }

  // Store U2Pick-specific config
  try {
    await storeModeConfig(typedBet.bet_id, 'u2pick', u2pickConfig);
  } catch (cfgError) {
    console.error('[betProposal] failed to store U2Pick config', {
      betId: typedBet.bet_id,
      error: (cfgError as any)?.message ?? cfgError,
    });
    // Cleanup bet on config failure
    await supabase.from('bet_proposals').delete().eq('bet_id', typedBet.bet_id);
    throw cfgError;
  }

  // Register lifecycle
  registerBetLifecycle(typedBet.bet_id, typedBet.close_time);

  return {
    bet: typedBet,
    preview,
    modeConfig: u2pickConfig,
  };
}
