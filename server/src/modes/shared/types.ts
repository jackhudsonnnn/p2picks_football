import type { BetProposal } from '../../supabaseClient';

export type ModeConfigStepDefinition = {
  key: string;
  component: string;
  label?: string;
  props?: Record<string, unknown>;
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

export interface ModeUserConfigChoice {
  value: string;
  label: string;
  description?: string;
  patch?: Record<string, unknown>;
  disabled?: boolean;
}

export type ModeUserConfigStep = [title: string, choices: ModeUserConfigChoice[]];

export interface ModeValidator {
  start(): void;
  stop(): void;
}

export interface ModeModule {
  definition: ModeDefinitionDTO;
  prepareConfig?: (input: {
    bet: BetProposal;
    config: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  validator?: ModeValidator;
  buildUserConfig?: (input: {
    nflGameId?: string | null;
    config: Record<string, unknown>;
  }) => Promise<ModeUserConfigStep[]>;
}
