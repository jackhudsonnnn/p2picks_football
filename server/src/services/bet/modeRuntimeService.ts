import {
  getModeDefinition,
  getMode,
  prepareModeConfig as prepareModeConfigFromRegistry,
  ensureInitialized,
} from '../../leagues';
import type {
  ModeContext,
  ModeConfigStepDefinition,
  ModeDefinitionDTO,
  ModeUserConfigChoice,
  ModeUserConfigStep,
} from '../../leagues/types';
import {
  computeModeOptions,
  computeWinningCondition,
} from '../../leagues/sharedUtils/utils';
import type { BetProposal } from '../../supabaseClient';
import {
  getHomeTeam,
  getAwayTeam,
  extractTeamId,
  extractTeamName,
  getMatchup,
} from '../leagueData';
import { extractGameId, resolveGameId } from '../../utils/gameId';
import type { League } from '../../types/league';

export type ModeUserConfigInput = {
  /** Canonical game ID (league-agnostic) */
  leagueGameId?: string | null;
  /** League identifier (required for proper routing) */
  league: League;
  config?: Record<string, unknown>;
};

export interface ModePreviewResult {
  description: string;
  options: string[];
  winningCondition?: string;
  errors: string[];
  modeLabel: string;
}

export async function prepareModeConfig(
  modeKey: string,
  bet: BetProposal,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ensureInitialized();
  const league = (config.league as League) || (bet.league as League);
  if (!league) {
    throw new Error('league is required for mode config preparation');
  }
  return prepareModeConfigFromRegistry(modeKey, bet, config, league);
}

export async function getModeUserConfigSteps(
  modeKey: string,
  input: ModeUserConfigInput,
): Promise<ModeUserConfigStep[]> {
  await ensureInitialized();
  const { league } = input;
  const result = getMode(modeKey, league);
  if (!result.found || !result.module!.buildUserConfig) {
    return [];
  }
  const gameId = resolveGameId({
    leagueGameId: input.leagueGameId,
    config: input.config,
  });
  const steps = await result.module!.buildUserConfig({
    leagueGameId: gameId,
    league,
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
  await ensureInitialized();
  const definition = requireModeDefinition(modeKey);
  await enrichConfigWithGameContext(config, bet);
  const ctx = buildModeContext(config, bet);

  const gameId = extractGameId(config) ?? '';
  const league = (config.league as League) || (bet?.league as League);
  if (!league) {
    throw new Error('league is required for mode preview');
  }
  const description = await getMatchup(league, gameId);
  const winningCondition = computeWinningCondition(definition, ctx);
  const options = computeModeOptions(definition, ctx);
  const errors = runModeValidator(definition, ctx);
  const modeLabel = deriveModeLabel(modeKey, definition);

  return {
    description,
    winningCondition: winningCondition && winningCondition.trim().length ? winningCondition : undefined,
    options,
    errors,
    modeLabel,
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
    const normalizedChoices = (step.choices || []).map(normalizeChoice);
    return {
      key,
      title,
      description,
      inputType,
      component,
      props,
      optional: step.optional ?? meta?.optional,
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
    league_game_id?: unknown;
    league?: unknown;
    home_team_id?: unknown;
    home_team_name?: unknown;
    away_team_id?: unknown;
    away_team_name?: unknown;
  };

  // Use the new utility to extract game ID
  const existingGameId = extractGameId(target);
  const betGameId = bet?.league_game_id ?? '';
  const gameId = existingGameId ?? betGameId;

  // Get league from config or bet (required for proper data lookup)
  const league = (target.league as League) || (bet?.league as League);
  if (!league) {
    console.warn('[enrichConfigWithGameContext] No league found in config or bet, skipping enrichment');
    return;
  }

  if (!gameId) {
    return;
  }

  // Set league_game_id if not already present
  if (!existingGameId) {
    target.league_game_id = gameId;
  }

  const needsHomeId = !isNonEmptyString(target.home_team_id);
  const needsHomeName = !isNonEmptyString(target.home_team_name);
  const needsAwayId = !isNonEmptyString(target.away_team_id);
  const needsAwayName = !isNonEmptyString(target.away_team_name);

  if (!needsHomeId && !needsHomeName && !needsAwayId && !needsAwayName) {
    return;
  }

  try {
    const homeTeam = await getHomeTeam(league, gameId);
    const awayTeam = await getAwayTeam(league, gameId);

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

function buildModeContext(
  config: Record<string, unknown>,
  bet?: BetProposal | null,
): ModeContext {
  return { config, bet: bet ?? null };
}

function runModeValidator(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string[] {
  if (!mode) return [];
  if (mode.validateConfig) {
    try {
      const errors = mode.validateConfig(ctx);
      return Array.isArray(errors) ? errors.filter((e) => e.trim().length > 0) : [];
    } catch (err) {
      console.warn('[modeValidator] validateConfig threw', { modeKey: mode.key, error: err });
      return ['Validation error'];
    }
  }

  return [];
}

function deriveModeLabel(modeKey: string, definition: ModeDefinitionDTO): string {
  const explicitLabel = typeof definition.label === 'string' ? definition.label.trim() : '';
  if (explicitLabel.length) {
    return explicitLabel;
  }
  const parts = modeKey.split(/[_\s]+/).filter(Boolean);
  const withoutPrefix = parts.length > 1 ? parts.slice(1) : parts;
  const formatted = withoutPrefix
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return formatted.length ? formatted : 'Bet Mode';
}
