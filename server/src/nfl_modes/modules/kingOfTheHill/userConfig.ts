/**
 * King Of The Hill - User Configuration Builder
 * Uses shared UserConfigBuilder utilities.
 */

import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import {
  loadGameContext,
  buildStatStep,
  buildPlayerStep,
  buildProgressModeStep,
  getDefaultProgressPatch,
  filterPlayersByStatPosition,
} from '../../shared/userConfigBuilder';
import {
  KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
  getStatResolveRange,
  getAllowedResolveValuesForStat,
} from './constants';
import { prepareValidPlayers, type PlayerRef } from '../../shared/playerUtils';
import { readPlayerStat, resolveStatKey, type KingOfTheHillConfig } from './evaluator';
import { resolveGameId, type GameContextInput } from '../../../utils/gameId';

export async function buildKingOfTheHillUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const gameId = resolveGameId(input as GameContextInput);
  const league = input.league ?? 'NFL';
  const context = await loadGameContext(league, gameId);
  const statKey = input.config?.stat as string | undefined;
  const selectedProgressMode = parseProgressModeSelection(input.config?.progress_mode);
  const filteredPlayers = filterPlayersByStatPosition(context.players, statKey);
  const preparedPlayers = prepareValidPlayers(filteredPlayers);
  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);
  const steps: ModeUserConfigStep[] = [];

  // Default progress mode when the progress step is hidden (e.g., STATUS_SCHEDULED)
  const effectiveProgressMode: 'starting_now' | 'cumulative' =
    selectedProgressMode ?? (context.showProgressStep ? 'starting_now' : 'starting_now');

  // Stat step
  steps.push(
    buildStatStep({
      statKeyToCategory: KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
      statKeyLabels: KING_OF_THE_HILL_STAT_KEY_LABELS,
      skipResolveStep: false,
      defaultProgressPatch,
      clearsOnChange: ['player1_id', 'player1_name', 'player2_id', 'player2_name'],
      clearStepsOnChange: ['player1', 'player2'],
    }),
  );

  // Player 1 step
  steps.push(
    buildPlayerStep({
      players: preparedPlayers,
      playerKey: 'player1',
      statKey,
    }),
  );

  // Player 2 step
  const player1Id = input.config?.player1_id as string | undefined;
  const playersForPlayer2 = player1Id
    ? preparedPlayers.filter((p) => p.id !== player1Id)
    : preparedPlayers;

  steps.push(
    buildPlayerStep({
      players: playersForPlayer2,
      playerKey: 'player2',
      statKey,
    }),
  );

  // Progress mode step (if game is in progress)
  if (context.showProgressStep) {
    const progressStep = buildProgressModeStep({
      showProgressStep: true,
      startingNowDescription: 'Capture current stats when betting closes; players must add the full resolve value from that snapshot.',
      cumulativeDescription: 'Use total game stats; the first player to hit the resolve value overall wins.',
    });
    if (progressStep) {
      steps.push(progressStep);
    }
  }

  // Resolve value step should always be available (scheduled or in-progress games)
  const resolveValueStep = await buildResolveValueStep({
    league,
    gameId,
    statKey,
    progressMode: context.showProgressStep ? selectedProgressMode : effectiveProgressMode,
    existingConfig: input.config,
  });
  steps.push(resolveValueStep);

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve Value Step Builder
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
  league: import('../../../types/league').League;
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
  league: import('../../../types/league').League;
  gameId: string | null;
  statKey?: string;
  progressMode: 'starting_now' | 'cumulative' | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ResolveValueContext> {
  // Use stat-specific allowed values
  const baseValues = getAllowedResolveValuesForStat(input.statKey);
  const { max: statMax } = getStatResolveRange(input.statKey);
  const defaultResult: ResolveValueContext = {
    values: baseValues,
    filterApplied: false,
    minAllowed: KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
    maxAllowed: statMax,
    highestValue: 0,
    player1Value: 0,
    player2Value: 0,
  };

  if (!input.gameId || input.progressMode !== 'cumulative' || !input.statKey) {
    return defaultResult;
  }

  const statConfig: KingOfTheHillConfig = { stat: input.statKey };
  const resolvedStatKey = resolveStatKey(statConfig);
  if (!resolvedStatKey) {
    return defaultResult;
  }

  const player1Ref: PlayerRef = {
    id: readConfigString(input.existingConfig, 'player1_id'),
    name: readConfigString(input.existingConfig, 'player1_name'),
  };
  const player2Ref: PlayerRef = {
    id: readConfigString(input.existingConfig, 'player2_id'),
    name: readConfigString(input.existingConfig, 'player2_name'),
  };

  const player1Value = await readPlayerStat(input.league, input.gameId, player1Ref, resolvedStatKey);
  const player2Value = await readPlayerStat(input.league, input.gameId, player2Ref, resolvedStatKey);
  const highestValue = Math.max(player1Value, player2Value, 0);
  const minAllowed = Math.max(KING_OF_THE_HILL_MIN_RESOLVE_VALUE, Math.floor(highestValue) + 1);
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

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

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
    readConfigString(config, nameKey) ||
    readConfigString(config, idKey) ||
    (playerKey === 'player1' ? 'Player 1' : 'Player 2')
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
    return normalized;
  }
  return null;
}

