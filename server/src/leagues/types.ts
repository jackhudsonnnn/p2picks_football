/**
 * Mode Registry Types
 * 
 * Defines the interfaces for league-aware mode modules that can
 * declare which leagues they support and provide league-specific
 * implementations.
 */

import type { BetProposal } from '../supabaseClient';
import type { League } from '../types/league';

// ─────────────────────────────────────────────────────────────────────────────
// Core Types (re-exported from nfl_modes for compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export type ModeUserConfigInputType = 'select';

export interface ModeContext {
  config: Record<string, unknown>;
  bet: BetProposal | null;
}

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

export interface ModeValidator {
  start(): void;
  stop(): void;
}

export interface ModeLiveInfo {
  modeKey: string;
  modeLabel: string;
  fields: { label: string; value: string | number }[];
  unavailableReason?: string;
}

export interface GetLiveInfoInput {
  betId: string;
  config: Record<string, unknown>;
  leagueGameId: string | null;
  league: League;
}

export interface BuildUserConfigInput {
  leagueGameId?: string | null;
  /** League is required for proper mode routing */
  league: League;
  config: Record<string, unknown>;
}

export interface ValidateProposalInput {
  leagueGameId?: string | null;
  /** League is required for proper mode routing */
  league: League;
  config: Record<string, unknown>;
}

export interface ValidateProposalResult {
  valid: boolean;
  error?: string;
  details?: unknown;
  configUpdates?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// League-Aware Mode Module
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
