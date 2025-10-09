import { getModeDefinition, getModeModule, prepareModeConfigPayload } from '../modes/registry';
import type { ModeDefinitionDTO, ModeUserConfigStep } from '../modes/shared/types';
import { computeModeOptions, renderModeTemplate, runModeValidator } from '../modes/shared/utils';
import type { BetProposal } from '../supabaseClient';
import { getSupabase } from '../supabaseClient';

export type ModeUserConfigInput = {
  nflGameId?: string | null;
  config?: Record<string, unknown>;
};

export interface ModePreviewResult {
  summary: string;
  description: string;
  secondary?: string;
  options: string[];
  winningCondition?: string;
  errors: string[];
}

export async function prepareModeConfig(
  modeKey: string,
  bet: BetProposal,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return prepareModeConfigPayload(modeKey, bet, config);
}

export async function getModeUserConfigSteps(
  modeKey: string,
  input: ModeUserConfigInput,
): Promise<ModeUserConfigStep[]> {
  const module = getModeModule(modeKey);
  if (!module || !module.buildUserConfig) {
    return [];
  }
  const steps = await module.buildUserConfig({
    nflGameId: input.nflGameId ?? null,
    config: input.config ?? {},
  });
  return steps ?? [];
}

export function buildModePreview(
  modeKey: string,
  config: Record<string, unknown>,
  bet: BetProposal | null = null,
): ModePreviewResult {
  const definition = requireModeDefinition(modeKey);
  const context = { config, bet, mode: definition } as const;

  const summary = safeLabel(
    renderModeTemplate(definition.summaryTemplate, context),
    definition.label,
  );
  const description = safeLabel(
    renderModeTemplate(definition.descriptionTemplate, context),
    summary,
  );
  const secondaryRaw = renderModeTemplate(definition.secondaryDescriptionTemplate, context);
  const secondary = secondaryRaw && secondaryRaw.trim().length ? secondaryRaw : undefined;
  const winningCondition = renderModeTemplate(definition.winningConditionTemplate, context);
  const options = computeModeOptions(definition, context);
  const errors = runModeValidator(definition.finalizeValidatorExpression, context);

  return {
    summary,
    description,
    secondary,
    winningCondition: winningCondition && winningCondition.trim().length ? winningCondition : undefined,
    options,
    errors,
  };
}

export function validateModeConfig(
  modeKey: string,
  config: Record<string, unknown>,
): string[] {
  const definition = requireModeDefinition(modeKey);
  const context = { config, bet: null, mode: definition } as const;
  return runModeValidator(definition.finalizeValidatorExpression, context);
}

function requireModeDefinition(modeKey: string): ModeDefinitionDTO {
  const definition = getModeDefinition(modeKey);
  if (!definition) {
    throw new Error(`mode ${modeKey} not found`);
  }
  return definition;
}

function safeLabel(candidate: string, fallback: string): string {
  const value = candidate && candidate.trim().length ? candidate : fallback;
  return value && value.trim().length ? value : fallback;
}

export async function ensureModeKeyMatchesBet(betId: string, modeKey?: string): Promise<BetProposal> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bet_proposals')
    .select('*')
    .eq('bet_id', betId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`bet ${betId} not found`);
  }
  const bet = data as BetProposal;
  if (modeKey && bet.mode_key && bet.mode_key !== modeKey) {
    throw new Error(`mode_key mismatch for bet ${betId}`);
  }
  if (!modeKey && !bet.mode_key) {
    throw new Error(`mode_key missing for bet ${betId}`);
  }
  return bet;
}
