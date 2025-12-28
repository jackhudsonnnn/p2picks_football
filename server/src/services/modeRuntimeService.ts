import { getModeDefinition, getModeModule, prepareModeConfigPayload } from '../modes/registry';
import type {
  ModeConfigStepDefinition,
  ModeContext,
  ModeDefinitionDTO,
  ModeUserConfigChoice,
  ModeUserConfigStep,
} from '../modes/shared/types';
import {
  buildModeContext,
  computeMatchupDescription,
  computeModeOptions,
  computeWinningCondition,
  renderModeTemplate,
  runModeValidator,
} from '../modes/shared/utils';
import type { BetProposal } from '../supabaseClient';
import { getSupabaseAdmin } from '../supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getGameDoc,
  getHomeTeamFromDoc,
  getAwayTeamFromDoc,
  extractTeamId,
  extractTeamName,
} from '../utils/refinedDocAccessors';

export type ModeUserConfigInput = {
  nflGameId?: string | null;
  config?: Record<string, unknown>;
};

export interface ModePreviewResult {
  summary: string;
  description: string;
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
  const definition = getModeDefinition(modeKey) ?? null;
  return normalizeModeUserConfigSteps(definition, steps ?? []);
}

export async function buildModePreview(
  modeKey: string,
  config: Record<string, unknown>,
  bet: BetProposal | null = null,
): Promise<ModePreviewResult> {
  const definition = requireModeDefinition(modeKey);
  await enrichConfigWithGameContext(config, bet);
  const ctx = buildModeContext(config, bet);

  const summary = safeLabel(
    renderModeTemplate(definition.summaryTemplate, { config, bet, mode: definition }),
    definition.label,
  );
  const description = computeMatchupDescription(definition, ctx);
  const winningCondition = computeWinningCondition(definition, ctx);
  const options = computeModeOptions(definition, ctx);
  const errors = runModeValidator(definition, ctx);

  return {
    summary,
    description,
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
  const ctx = buildModeContext(config, null);
  return runModeValidator(definition, ctx);
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

function normalizeModeUserConfigSteps(
  definition: ModeDefinitionDTO | null,
  steps: ModeUserConfigStep[],
): ModeUserConfigStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [];
  }
  const metadataMap = new Map<string, ModeConfigStepDefinition>();
  definition?.configSteps?.forEach((meta) => {
    metadataMap.set(meta.key, meta);
  });
  return steps.map((step, index) => {
    const meta = step.key ? metadataMap.get(step.key) : undefined;
    const key = step.key || meta?.key || `step_${index}`;
    const title = step.title || meta?.label || `Step ${index + 1}`;
    const inputType = step.inputType || meta?.inputType;
    const description = step.description ?? meta?.description;
    const component = step.component || meta?.component;
    const props = step.props || meta?.props;
    const validatorExpression = step.validatorExpression || meta?.validatorExpression;
    const normalizedChoices = (step.choices || []).map(normalizeChoice);
    return {
      key,
      title,
      description,
      inputType,
      component,
      props,
      optional: step.optional ?? meta?.optional,
      validatorExpression,
      choices: normalizedChoices,
    } satisfies ModeUserConfigStep;
  });
}

function normalizeChoice(choice: ModeUserConfigChoice): ModeUserConfigChoice {
  const id = choice.id || choice.value;
  return {
    ...choice,
    id,
    value: choice.value,
    label: choice.label,
    patch: choice.patch ? { ...choice.patch } : undefined,
    clears: choice.clears ? [...choice.clears] : undefined,
  };
}

async function enrichConfigWithGameContext(config: Record<string, unknown>, bet: BetProposal | null): Promise<void> {
  const target = config as Record<string, unknown> & {
    nfl_game_id?: unknown;
    home_team_id?: unknown;
    home_team_name?: unknown;
    away_team_id?: unknown;
    away_team_name?: unknown;
  };

  const configGameId = typeof target.nfl_game_id === 'string' ? target.nfl_game_id.trim() : '';
  const betGameId = bet?.nfl_game_id ?? '';
  const gameId = configGameId.length ? configGameId : betGameId;

  if (!gameId) {
    return;
  }

  if (!configGameId.length) {
    target.nfl_game_id = gameId;
  }

  const needsHomeId = !isNonEmptyString(target.home_team_id);
  const needsHomeName = !isNonEmptyString(target.home_team_name);
  const needsAwayId = !isNonEmptyString(target.away_team_id);
  const needsAwayName = !isNonEmptyString(target.away_team_name);

  if (!needsHomeId && !needsHomeName && !needsAwayId && !needsAwayName) {
    return;
  }

  try {
    const doc = await getGameDoc(gameId);
    if (!doc) return;

    const homeTeam = getHomeTeamFromDoc(doc);
    const awayTeam = getAwayTeamFromDoc(doc);

    if (needsHomeId && !target.home_team_id) {
      target.home_team_id = extractTeamId(homeTeam);
    }
    if (needsHomeName && !target.home_team_name) {
      target.home_team_name = extractTeamName(homeTeam);
    }
    if (needsAwayId && !target.away_team_id) {
      target.away_team_id = extractTeamId(awayTeam);
    }
    if (needsAwayName && !target.away_team_name) {
      target.away_team_name = extractTeamName(awayTeam);
    }
  } catch (err) {
    // swallow errors to avoid blocking preview rendering; logging handled elsewhere if needed
  }
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function ensureModeKeyMatchesBet(
  betId: string,
  modeKey?: string,
  client?: SupabaseClient,
): Promise<BetProposal> {
  const supabase = client ?? getSupabaseAdmin();
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
