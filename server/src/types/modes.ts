/**
 * Mode System Types
 *
 * Canonical type definitions for the mode system.
 * These types define the interfaces for mode definitions, user configuration,
 * validation, and live info across all leagues.
 */

import type { BetProposal } from '../supabaseClient';
import type { League } from './league';

// ─────────────────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared player record type used across all mode userConfig builders.
 */
export type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position?: string | null;
};

export type ModeUserConfigInputType = 'select';

/**
 * Context passed to mode definition functions for computing options, validation, etc.
 */
export interface ModeContext {
  config: Record<string, unknown>;
  bet: BetProposal | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode Definition Types
// ─────────────────────────────────────────────────────────────────────────────

export type ModeConfigStepDefinition = {
  key: string;
  component: string;
  label?: string;
  description?: string;
  inputType?: ModeUserConfigInputType;
  props?: Record<string, unknown>;
  optional?: boolean;
  validate?: (ctx: ModeContext) => string[];
};

export type ModeDefinitionDTO = {
  key: string;
  label: string;
  computeWinningCondition: (ctx: ModeContext) => string;
  computeOptions: (ctx: ModeContext) => string[];
  staticOptions?: string[];
  configSteps: ModeConfigStepDefinition[];
  validateConfig?: (ctx: ModeContext) => string[];
  metadata?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Mode Overview Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModeOverviewExample {
  title?: string;
  description: string;
}

export interface ModeOverview {
  key: string;
  label: string;
  tagline: string;
  description: string;
  proposerConfiguration: string[];
  participantChoices: string[];
  winningCondition: string;
  notes?: string[];
  example?: ModeOverviewExample;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Config Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModeUserConfigChoice {
  id?: string;
  value: string;
  label: string;
  description?: string;
  patch?: Record<string, unknown>;
  clears?: string[];
  clearSteps?: string[];
  disabled?: boolean;
}

export interface ModeUserConfigStep {
  key: string;
  title: string;
  description?: string;
  inputType?: ModeUserConfigInputType;
  component?: string;
  props?: Record<string, unknown>;
  optional?: boolean;
  validationErrors?: string[];
  selectedChoiceId?: string | null;
  completed?: boolean;
  choices: ModeUserConfigChoice[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModeValidator {
  start(): void;
  stop(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Info Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Live info payload returned to the client for displaying real-time bet status.
 */
export interface ModeLiveInfo {
  modeKey: string;
  /** Human-readable label for the mode */
  modeLabel: string;
  /** Key-value pairs to display in the info modal */
  fields: { label: string; value: string | number }[];
  /** Optional message if live info is unavailable */
  unavailableReason?: string;
}

export interface GetLiveInfoInput {
  betId: string;
  config: Record<string, unknown>;
  /** Canonical game ID (league-agnostic) */
  leagueGameId: string | null;
  league: League;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build User Config Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildUserConfigInput {
  /** Canonical game ID (league-agnostic) */
  leagueGameId?: string | null;
  /** League identifier */
  league?: League;
  /** Existing config state */
  config: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposal Validation Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidateProposalInput {
  /** Canonical game ID (league-agnostic) */
  leagueGameId?: string | null;
  /** League identifier */
  league?: League;
  /** Mode configuration */
  config: Record<string, unknown>;
}

export interface ValidateProposalResult {
  valid: boolean;
  error?: string;
  details?: unknown;
  configUpdates?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode Module Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A mode module that can be registered in the mode system.
 */
export interface ModeModule {
  definition: ModeDefinitionDTO;
  overview?: ModeOverview;
  prepareConfig?: (input: {
    bet: BetProposal;
    config: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  validator?: ModeValidator;
  buildUserConfig?: (input: BuildUserConfigInput) => Promise<ModeUserConfigStep[]>;
  validateProposal?: (input: ValidateProposalInput) => Promise<ValidateProposalResult>;
  getLiveInfo?: (input: GetLiveInfoInput) => Promise<ModeLiveInfo>;
}

// ─────────────────────────────────────────────────────────────────────────────
// League-Aware Mode Module Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A mode module that declares which leagues it supports.
 * This is the core interface for the multi-sport mode system.
 */
export interface LeagueModeModule {
  /** Unique mode identifier (e.g., 'either_or', 'total_disaster') */
  key: string;

  /** Human-readable mode label */
  label: string;

  /**
   * Leagues this mode supports.
   * Use ['*'] to indicate support for all leagues.
   */
  supportedLeagues: League[] | ['*'];

  /** Mode definition for UI rendering */
  definition: ModeDefinitionDTO;

  /** Optional detailed overview */
  overview?: ModeOverview;

  /**
   * Prepare config payload before bet creation.
   * Called to enrich config with game/player data.
   */
  prepareConfig?: (input: {
    bet: BetProposal;
    config: Record<string, unknown>;
    league: League;
  }) => Promise<Record<string, unknown>>;

  /** Mode validator for real-time bet resolution */
  validator?: ModeValidator;

  /**
   * Build user config steps for the proposer UI.
   * Returns the configuration wizard steps.
   */
  buildUserConfig?: (input: BuildUserConfigInput) => Promise<ModeUserConfigStep[]>;

  /**
   * Validate a bet proposal before submission.
   * Called to check if the bet is valid for the current game state.
   */
  validateProposal?: (input: ValidateProposalInput) => Promise<ValidateProposalResult>;

  /**
   * Get live info for display during an active bet.
   * Returns real-time data for the bet status UI.
   */
  getLiveInfo?: (input: GetLiveInfoInput) => Promise<ModeLiveInfo>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode Registry Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registration entry for a mode in the unified registry.
 */
export interface ModeRegistryEntry {
  module: LeagueModeModule;
  /** Cached set of supported leagues for fast lookup */
  leagueSet: Set<League> | 'all';
}

/**
 * Result of looking up a mode for a specific league.
 */
export interface ModeLookupResult {
  found: boolean;
  module?: LeagueModeModule;
  reason?: 'not_found' | 'league_not_supported';
}
