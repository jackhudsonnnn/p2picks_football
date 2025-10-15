import { getModeDefinition, getModeModule, prepareModeConfigPayload } from '../modes/registry';
import type { ModeDefinitionDTO, ModeUserConfigStep } from '../modes/shared/types';
import { computeModeOptions, renderModeTemplate, runModeValidator } from '../modes/shared/utils';
import type { BetProposal } from '../supabaseClient';
import { getSupabase } from '../supabaseClient';
import { loadRefinedGame, type RefinedGameDoc, type Team } from '../helpers';

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

export async function buildModePreview(
  modeKey: string,
  config: Record<string, unknown>,
  bet: BetProposal | null = null,
): Promise<ModePreviewResult> {
  const definition = requireModeDefinition(modeKey);
  await enrichConfigWithGameContext(config, bet);
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
    const doc = await loadRefinedGame(gameId);
    if (!doc) return;

    const homeTeam = pickHomeTeam(doc);
    const awayTeam = pickAwayTeam(doc, homeTeam);

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

function pickHomeTeam(doc: RefinedGameDoc): Team | null {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  return (
    teams.find((team) => String((team as any)?.homeAway || '').toLowerCase() === 'home') ||
    teams[0] ||
    null
  );
}

function pickAwayTeam(doc: RefinedGameDoc, home: Team | null): Team | null {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  const byFlag = teams.find((team) => String((team as any)?.homeAway || '').toLowerCase() === 'away');
  if (byFlag) return byFlag;
  return teams.find((team) => team !== home) || null;
}

function extractTeamId(team: Team | null): string | null {
  if (!team) return null;
  const rawId = (team as any)?.teamId || (team as any)?.abbreviation;
  return rawId ? String(rawId) : null;
}

function extractTeamName(team: Team | null): string | null {
  if (!team) return null;
  const name = (team as any)?.displayName || (team as any)?.abbreviation || (team as any)?.teamId;
  return name ? String(name) : null;
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
