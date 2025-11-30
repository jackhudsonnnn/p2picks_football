import type { BetProposal } from '../../supabaseClient';

export type ModeUserConfigInputType = 'select' | 'radio';

export type ModeConfigStepDefinition = {
  key: string;
  component: string;
  label?: string;
  description?: string;
  inputType?: ModeUserConfigInputType;
  props?: Record<string, unknown>;
  optional?: boolean;
  validatorExpression?: string;
};

export type ModeDefinitionDTO = {
  key: string;
  label: string;
  summaryTemplate?: string;
  descriptionTemplate?: string;
  secondaryDescriptionTemplate?: string;
  winningConditionTemplate?: string;
  optionsExpression?: string;
  staticOptions?: string[];
  configSteps: ModeConfigStepDefinition[];
  finalizeValidatorExpression?: string;
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
}
