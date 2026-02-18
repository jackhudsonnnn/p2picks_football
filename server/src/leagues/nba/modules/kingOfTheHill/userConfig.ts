import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep, PlayerRecord } from '../../../sharedUtils/types';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import {
  NBA_KOTH_ALLOWED_RESOLVE_VALUES,
  NBA_KOTH_STAT_KEY_LABELS,
  getAllowedResolveValuesForStat,
  getStatResolveRange,
} from './constants';
import { readPlayerStat, resolveStatKey } from './evaluator';
import { buildProgressModeStep, getDefaultProgressPatch, loadGameContext } from '../../utils/userConfigBuilder';

export async function buildKingOfTheHillUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const league = input.league ?? 'NBA';
  const gameId = resolveGameId(input as GameContextInput) ?? '';
  const statKey = typeof input.config?.stat === 'string' ? input.config?.stat : null;
  const context = await loadGameContext(league, gameId);
  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);

  const statChoices: ModeUserConfigChoice[] = Object.entries(NBA_KOTH_STAT_KEY_LABELS).map(([key, label]) => ({
    id: key,
    value: key,
    label,
    patch: { stat: key, stat_label: label, ...defaultProgressPatch },
    clears: ['player1_id', 'player1_name', 'player2_id', 'player2_name', 'resolve_value', 'resolve_value_label'],
  }));

  const players: PlayerRecord[] = context.players;

  const player1Choices: ModeUserConfigChoice[] = players.map((p) => ({
    id: p.id,
    value: p.id,
    label: p.name,
    description: p.position ?? undefined,
    patch: { player1_id: p.id, player1_name: p.name },
  }));

  const player2Choices: ModeUserConfigChoice[] = players.map((p) => ({
    id: p.id,
    value: p.id,
    label: p.name,
    description: p.position ?? undefined,
    patch: { player2_id: p.id, player2_name: p.name },
  }));

  const allowedResolveValues = statKey ? getAllowedResolveValuesForStat(statKey) : NBA_KOTH_ALLOWED_RESOLVE_VALUES;
  const resolveChoices: ModeUserConfigChoice[] = allowedResolveValues.map((value) => ({
    id: String(value),
    value: String(value),
    label: String(value),
    patch: { resolve_value: value, resolve_value_label: String(value) },
  }));

  const steps: ModeUserConfigStep[] = [
    { key: 'stat', title: 'Select Stat', inputType: 'select', choices: statChoices },
    { key: 'player1', title: 'Select Player 1', inputType: 'select', choices: player1Choices },
    { key: 'player2', title: 'Select Player 2', inputType: 'select', choices: player2Choices },
  ];

  const progressStep = buildProgressModeStep({
    showProgressStep: context.showProgressStep,
    startingNowDescription: 'Capture baselines when betting closes; first to add the threshold wins.',
    cumulativeDescription: 'Use full-game totals; first to reach the threshold wins.',
  });

  if (progressStep) {
    steps.push(progressStep);
  }

  // Build resolve value step with optional filtering based on current player stats
  const selectedProgressMode = parseProgressModeSelection(input.config?.progress_mode);
  const effectiveProgressMode: 'starting_now' | 'cumulative' = selectedProgressMode ?? (context.showProgressStep ? 'starting_now' : 'starting_now');
  const resolveValueStep = await buildResolveValueStep({
    league,
    gameId,
    statKey: statKey ?? undefined,
    progressMode: context.showProgressStep ? selectedProgressMode : effectiveProgressMode,
    existingConfig: input.config,
  });
  steps.push(resolveValueStep);

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve Value Step Builder (similar to NFL implementation)
// ─────────────────────────────────────────────────────────────────────────────

interface ResolveValueContext {
  values: number[];
  filterApplied: boolean;
  minAllowed: number;
  maxAllowed: number;
  highestValue: number;
  player1Value: number;
  player2Value: number;
}

async function buildResolveValueStep(input: {
  league: import('../../../../types/league').League;
  gameId: string | null;
  statKey?: string;
  progressMode: 'starting_now' | 'cumulative' | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ModeUserConfigStep> {
  const filterContext = await computeResolveValueFilter(input);
  const description = buildResolveValueDescription(filterContext, input.existingConfig);

  let choices: ModeUserConfigChoice[];
  if (!filterContext.values.length) {
    choices = [
      {
        id: 'resolve_value_unavailable',
        value: 'resolve_value_unavailable',
        label: 'No valid resolve values available',
        description: 'Both players already surpassed the maximum allowed for this stat. Pick different players or a new stat.',
        disabled: true,
      },
    ];
  } else {
    choices = filterContext.values.map((value) => ({
      id: String(value),
      value: String(value),
      label: String(value),
      patch: {
        resolve_value: value,
        resolve_value_label: String(value),
      },
    }));
  }

  return {
    key: 'resolve_value',
    title: 'Resolve Value',
    inputType: 'select',
    description,
    choices,
  };
}

async function computeResolveValueFilter(input: {
  league: import('../../../../types/league').League;
  gameId: string | null;
  statKey?: string;
  progressMode: 'starting_now' | 'cumulative' | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ResolveValueContext> {
  // Use stat-specific allowed values
  const baseValues = getAllowedResolveValuesForStat(input.statKey);
  const { max: statMax, min: statMin } = getStatResolveRange(input.statKey);
  const defaultResult: ResolveValueContext = {
    values: baseValues,
    filterApplied: false,
    minAllowed: statMin,
    maxAllowed: statMax,
    highestValue: 0,
    player1Value: 0,
    player2Value: 0,
  };

  if (!input.gameId || input.progressMode !== 'cumulative' || !input.statKey) {
    return defaultResult;
  }

  const resolvedStatKey = resolveStatKey({ stat: input.statKey } as any);
  if (!resolvedStatKey) {
    return defaultResult;
  }

  const player1Ref = {
    id: readConfigString(input.existingConfig, 'player1_id'),
    name: readConfigString(input.existingConfig, 'player1_name'),
  };
  const player2Ref = {
    id: readConfigString(input.existingConfig, 'player2_id'),
    name: readConfigString(input.existingConfig, 'player2_name'),
  };

  const player1Value = await readPlayerStat(input.league, input.gameId, player1Ref, resolvedStatKey);
  const player2Value = await readPlayerStat(input.league, input.gameId, player2Ref, resolvedStatKey);
  const highestValue = Math.max(player1Value, player2Value, 0);
  const minAllowed = Math.max(statMin, Math.floor(highestValue) + 1);
  const filteredValues = baseValues.filter((value) => value >= minAllowed);

  return {
    values: filteredValues,
    filterApplied: true,
    minAllowed,
    maxAllowed: statMax,
    highestValue,
    player1Value,
    player2Value,
  };
}

function buildResolveValueDescription(
  context: ResolveValueContext,
  existingConfig?: Record<string, unknown>,
): string | undefined {
  if (!context.filterApplied) return undefined;

  const player1Name = readPlayerLabel(existingConfig, 'player1');
  const player2Name = readPlayerLabel(existingConfig, 'player2');

  if (!context.values.length) {
    return `No resolve values remain because ${player1Name} (${formatStatValue(context.player1Value)}) and ${player2Name} (${formatStatValue(
      context.player2Value,
    )}) already exceed the maximum of ${context.maxAllowed}. Pick different players or stats.`;
  }

  return `Current totals — ${player1Name}: ${formatStatValue(context.player1Value)}, ${player2Name}: ${formatStatValue(
    context.player2Value,
  )}. Targets now start at ${context.minAllowed}.`;
}

function readConfigString(config: Record<string, unknown> | undefined, key: string): string | undefined {
  const raw = config?.[key];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return undefined;
}

function readPlayerLabel(config: Record<string, unknown> | undefined, playerKey: 'player1' | 'player2'): string {
  const nameKey = playerKey === 'player1' ? 'player1_name' : 'player2_name';
  const idKey = playerKey === 'player1' ? 'player1_id' : 'player2_id';
  return (
    readConfigString(config, nameKey) || readConfigString(config, idKey) || (playerKey === 'player1' ? 'Player 1' : 'Player 2')
  );
}

function formatStatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Number.isFinite(value)) return value.toFixed(1);
  return '0';
}

function parseProgressModeSelection(value: unknown): 'starting_now' | 'cumulative' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'starting_now' || normalized === 'cumulative') {
    return normalized as 'starting_now' | 'cumulative';
  }
  return null;
}
