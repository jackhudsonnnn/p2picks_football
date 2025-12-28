import type { BetProposal } from '../../supabaseClient';

/**
 * Shared player record type used across all mode userConfig builders.
 */
export type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position?: string | null;
};

export type ModeUserConfigInputType = 'select' | 'radio';

/**
 * Context passed to mode definition functions for computing options, validation, etc.
 */
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
  /** @deprecated Use validate function instead */
  validatorExpression?: string;
  /** Type-safe validator function */
  validate?: (ctx: ModeContext) => string[];
};

export type ModeDefinitionDTO = {
  key: string;
  label: string;
  summaryTemplate?: string;
  /** @deprecated matchupTemplate is now handled by default - remove from definitions */
  matchupTemplate?: string;
  /** @deprecated Use computeWinningCondition function instead */
  winningConditionTemplate?: string;
  /** Type-safe function to compute winning condition description */
  computeWinningCondition?: (ctx: ModeContext) => string;
  /** @deprecated Use computeOptions function instead */
  optionsExpression?: string;
  /** Type-safe function to compute available options */
  computeOptions?: (ctx: ModeContext) => string[];
  staticOptions?: string[];
  configSteps: ModeConfigStepDefinition[];
  /** @deprecated Use validateConfig function instead */
  finalizeValidatorExpression?: string;
  /** Type-safe function to validate final config */
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
  validatorExpression?: string;
  validationErrors?: string[];
  selectedChoiceId?: string | null;
  completed?: boolean;
  choices: ModeUserConfigChoice[];
}

export interface ModeValidator {
  start(): void;
  stop(): void;
}

/**
 * Live info payload returned to the client for displaying real-time bet status.
 * Each mode can define its own fields, but common patterns include:
 * - Total Disaster: scores, total points, line
 * - King of the Hill: player names, baselines, current values, target
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
  nflGameId: string | null;
}

export interface ModeModule {
  definition: ModeDefinitionDTO;
  overview?: ModeOverview;
  prepareConfig?: (input: {
    bet: BetProposal;
    config: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  validator?: ModeValidator;
  buildUserConfig?: (input: {
    nflGameId?: string | null;
    config: Record<string, unknown>;
  }) => Promise<ModeUserConfigStep[]>;
  validateProposal?: (input: {
    nflGameId: string;
    config: Record<string, unknown>;
  }) => Promise<{ valid: boolean; error?: string; details?: any; configUpdates?: Record<string, unknown> }>;
  getLiveInfo?: (input: GetLiveInfoInput) => Promise<ModeLiveInfo>;
}
