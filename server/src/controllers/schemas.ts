/**
 * Request Validation Schemas
 *
 * Zod schemas for every write endpoint's request body and
 * for path-parameter validation (UUID format enforcement).
 *
 * Centralised here so controllers stay thin and the schemas
 * are easy to find, review, and test.
 */

import { z } from 'zod';
import { LEAGUES } from '../types/league';
import {
  WAGER_MIN,
  WAGER_MAX,
  TIME_LIMIT_MIN,
  TIME_LIMIT_MAX,
} from '../constants/betting';

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical UUID v1-v5 pattern. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidString = z.string().regex(UUID_REGEX, 'Must be a valid UUID');

/** Non-empty trimmed string. */
const nonEmptyString = z.string().trim().min(1);

/** League enum derived from the canonical LEAGUES constant. */
const leagueEnum = z.enum(LEAGUES);

// ─────────────────────────────────────────────────────────────────────────────
// Path parameter schemas
// ─────────────────────────────────────────────────────────────────────────────

export const tableIdParams = z.object({
  tableId: uuidString,
});

export const betIdParams = z.object({
  betId: uuidString,
});

export const sessionIdParams = z.object({
  sessionId: nonEmptyString,
});

export const modeKeyParams = z.object({
  modeKey: nonEmptyString,
});

export const leagueParams = z.object({
  league: nonEmptyString,
});

export const leagueModeKeyParams = z.object({
  league: nonEmptyString,
  modeKey: nonEmptyString,
});

export const friendRequestActionParams = z.object({
  requestId: uuidString,
  action: z.enum(['accept', 'decline', 'cancel']),
});

export const betProposalBootstrapParams = z.object({
  league: nonEmptyString,
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Bet endpoints
// ─────────────────────────────────────────────────────────────────────────────

export const createBetProposalBody = z.object({
  proposer_user_id: uuidString,
  league: z
    .string()
    .optional()
    .default('U2Pick'),
  league_game_id: z.string().optional(),
  mode_key: z.string().optional(),
  config_session_id: z.string().trim().optional(),
  wager_amount: z
    .number()
    .min(WAGER_MIN, `Wager must be at least ${WAGER_MIN}`)
    .max(WAGER_MAX, `Wager must be at most ${WAGER_MAX}`)
    .optional(),
  time_limit_seconds: z
    .number()
    .int()
    .min(TIME_LIMIT_MIN, `Time limit must be at least ${TIME_LIMIT_MIN}s`)
    .max(TIME_LIMIT_MAX, `Time limit must be at most ${TIME_LIMIT_MAX}s`)
    .optional(),
  mode_config: z.record(z.string(), z.unknown()).optional(),
  // U2Pick-specific
  u2pick_winning_condition: z.string().optional(),
  u2pick_options: z.array(z.string()).optional(),
});

export const validateBetBody = z.object({
  winning_choice: nonEmptyString,
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Message endpoints
// ─────────────────────────────────────────────────────────────────────────────

export const sendMessageBody = z.object({
  message: z.string().min(1, 'Message is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Friend endpoints
// ─────────────────────────────────────────────────────────────────────────────

export const addFriendBody = z.object({
  username: nonEmptyString,
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Mode / Config Session endpoints
// ─────────────────────────────────────────────────────────────────────────────

export const createSessionBody = z.object({
  mode_key: nonEmptyString,
  league_game_id: nonEmptyString,
  league: nonEmptyString,
});

export const applySessionChoiceBody = z.object({
  step_key: nonEmptyString,
  choice_id: nonEmptyString,
});

export const updateSessionGeneralBody = z.object({
  wager_amount: z
    .number()
    .min(WAGER_MIN)
    .max(WAGER_MAX)
    .optional(),
  time_limit_seconds: z
    .number()
    .int()
    .min(TIME_LIMIT_MIN)
    .max(TIME_LIMIT_MAX)
    .optional(),
});

export const updateBetModeConfigBody = z.object({
  mode_key: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

export const batchModeConfigBody = z.object({
  betIds: z.array(uuidString).min(1, 'betIds array required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — League-scoped mode endpoints (user-config, preview)
// ─────────────────────────────────────────────────────────────────────────────

export const modeUserConfigBody = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  league_game_id: z.string().optional(),
});

export const modePreviewBody = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  league_game_id: z.string().optional(),
  bet_id: z.string().optional(),
});

// Legacy mode endpoints include league in the body
export const legacyModeUserConfigBody = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  league_game_id: z.string().optional(),
  league: nonEmptyString,
});

export const legacyModePreviewBody = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  league_game_id: z.string().optional(),
  league: nonEmptyString,
  bet_id: z.string().optional(),
});
