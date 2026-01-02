/**
 * BetProposalService - Handles the core business logic for creating and managing bet proposals.
 * Extracted from betController.ts to decouple business logic from HTTP handling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, type BetProposal } from '../../supabaseClient';
import { getGameStatus } from '../nflData/nflRefinedDataAccessors';
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
import { getModeModule } from '../../modes/registry';
import { normalizeToHundredth } from '../../utils/number';
import {
  DEFAULT_WAGER,
  DEFAULT_TIME_LIMIT,
} from '../../constants/betting';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateBetProposalInput {
  tableId: string;
  proposerUserId: string;
  modeKey?: string;
  nflGameId?: string | null;
  configSessionId?: string;
  wagerAmount?: number;
  timeLimitSeconds?: number;
  modeConfig?: Record<string, unknown>;
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
  // Process session if provided
  let consumedSession: ConsumedModeConfigSession | null = null;
  let modeKey = input.modeKey ?? '';
  let nflGameId = input.nflGameId ?? null;

  if (input.configSessionId) {
    try {
      consumedSession = consumeModeConfigSession(input.configSessionId);
      modeKey = consumedSession.modeKey;
      nflGameId = consumedSession.nflGameId;
    } catch (err: any) {
      throw BetProposalError.badRequest(err?.message || 'invalid configuration session');
    }
  }

  if (!modeKey) {
    throw BetProposalError.badRequest('mode_key required');
  }

  // Normalize wager and time limit
  let wagerAmount = normalizeWagerAmount(
    normalizeToHundredth(input.wagerAmount ?? DEFAULT_WAGER),
  );
  let timeLimitSeconds = normalizeTimeLimitSeconds(input.timeLimitSeconds ?? DEFAULT_TIME_LIMIT);

  // Build mode config
  let modeConfig: Record<string, unknown> = input.modeConfig
    ? { ...input.modeConfig }
    : {};

  if (consumedSession) {
    modeConfig = { ...consumedSession.config };
    wagerAmount = consumedSession.general.wager_amount;
    timeLimitSeconds = consumedSession.general.time_limit_seconds;
  }

  // Ensure nfl_game_id is in config
  modeConfig = normalizeGameIdInConfig(modeConfig, nflGameId);
  const configGameId = extractGameIdFromConfig(modeConfig);

  // Validate game status
  await validateGameStatus(configGameId, nflGameId);

  // Run mode-specific validation
  await runModeSpecificValidation(modeKey, modeConfig, nflGameId);

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
    nfl_game_id: nflGameId,
    mode_key: modeKey,
    description: preview.description || preview.summary || 'Bet',
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
  const description = preview.description || preview.summary || sourceBet.description || 'Bet';

  // Insert new bet
  const { data: newBet, error: insertError } = await supabase
    .from('bet_proposals')
    .insert([
      {
        table_id: sourceBet.table_id,
        proposer_user_id: input.proposerUserId,
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

function normalizeGameIdInConfig(
  config: Record<string, unknown>,
  nflGameId: string | null,
): Record<string, unknown> {
  const result = { ...config };

  if (typeof (result as any).nfl_game_id === 'string') {
    const trimmed = (result as any).nfl_game_id.trim();
    if (trimmed.length) {
      (result as any).nfl_game_id = trimmed;
    } else {
      delete (result as any).nfl_game_id;
    }
  }

  if (nflGameId && !extractGameIdFromConfig(result)) {
    (result as any).nfl_game_id = nflGameId;
  }

  return result;
}

function extractGameIdFromConfig(config: Record<string, unknown>): string | null {
  const value = (config as any).nfl_game_id;
  if (typeof value === 'string' && value.trim().length) {
    return value.trim();
  }
  return null;
}

async function validateGameStatus(
  configGameId: string | null,
  nflGameId: string | null,
): Promise<void> {
  const gameIdsToCheck = new Set<string>();
  if (configGameId) gameIdsToCheck.add(configGameId);
  if (nflGameId) gameIdsToCheck.add(nflGameId);

  for (const gameId of gameIdsToCheck) {
    const status = await getGameStatus(gameId);
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
  nflGameId: string | null,
): Promise<void> {
  const modeModule = getModeModule(modeKey);
  if (!modeModule?.validateProposal) return;

  const gameIdForCheck =
    typeof modeConfig.nfl_game_id === 'string' && modeConfig.nfl_game_id.trim().length
      ? modeConfig.nfl_game_id.trim()
      : nflGameId;

  if (!gameIdForCheck) return;

  const validationResult = await modeModule.validateProposal({
    nflGameId: gameIdForCheck,
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
  const modeConfig = { ...existingData };

  if (sourceBet.nfl_game_id && typeof sourceBet.nfl_game_id === 'string') {
    const configGameId =
      typeof (modeConfig as any).nfl_game_id === 'string'
        ? (modeConfig as any).nfl_game_id.trim()
        : '';
    if (!configGameId.length) {
      (modeConfig as any).nfl_game_id = sourceBet.nfl_game_id;
    }
  }

  return modeConfig;
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
