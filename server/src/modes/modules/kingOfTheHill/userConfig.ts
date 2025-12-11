/**
 * King Of The Hill - User Configuration Builder
 * Uses shared UserConfigBuilder utilities.
 */

import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import {
  loadGameContext,
  buildStatStep,
  buildPlayerStep,
  buildProgressModeStep,
  getDefaultProgressPatch,
  filterPlayersByStatPosition,
  normalizeProgressMode,
} from '../../shared/userConfigBuilder';
import { prepareValidPlayers } from '../../shared/playerUtils';
import type { PlayerRef } from '../../shared/playerStatUtils';
import {
  KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
  KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  KING_OF_THE_HILL_MAX_RESOLVE_VALUE,
  KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
} from './constants';
import { readPlayerStat, resolveStatKey, type KingOfTheHillConfig } from './evaluator';

const DEBUG = process.env.DEBUG_KING_OF_THE_HILL === '1' || process.env.DEBUG_KING_OF_THE_HILL === 'true';

export async function buildKingOfTheHillUserConfig(input: {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ModeUserConfigStep[]> {
  const gameId = input.nflGameId ? String(input.nflGameId) : null;
  const context = await loadGameContext(gameId);
  const statKey = input.existingConfig?.stat as string | undefined;
  const selectedProgressMode = parseProgressModeSelection(input.existingConfig?.progress_mode);

  // Filter players by position based on stat
  const filteredPlayers = filterPlayersByStatPosition(context.players, statKey);
  const preparedPlayers = prepareValidPlayers(filteredPlayers);

  if (DEBUG) {
    console.log('[kingOfTheHill][userConfig] building steps', {
      gameId,
      playerCount: context.players.length,
      filteredPlayerCount: preparedPlayers.length,
      statKey,
      showProgressStep: context.showProgressStep,
      selectedProgressMode,
    });
  }

  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);

  const steps: ModeUserConfigStep[] = [];

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
  steps.push(
    buildPlayerStep({
      players: preparedPlayers,
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

    // Resolve value step with filtering for cumulative mode
    const resolveValueStep = buildResolveValueStep({
      doc: context.doc,
      statKey,
      progressMode: selectedProgressMode,
      existingConfig: input.existingConfig,
    });
    steps.push(resolveValueStep);
  }

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve Value Step Builder
// ─────────────────────────────────────────────────────────────────────────────

interface ResolveValueContext {
  values: number[];
  filterApplied: boolean;
  minAllowed: number;
  highestValue: number;
  player1Value: number;
  player2Value: number;
}

function buildResolveValueStep(input: {
  doc: any;
  statKey?: string;
  progressMode: 'starting_now' | 'cumulative' | null;
  existingConfig?: Record<string, unknown>;
}): ModeUserConfigStep {
  const filterContext = computeResolveValueFilter(input);
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

function computeResolveValueFilter(input: {
  doc: any;
  statKey?: string;
  progressMode: 'starting_now' | 'cumulative' | null;
  existingConfig?: Record<string, unknown>;
}): ResolveValueContext {
  const baseValues = [...KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES];
  const defaultResult: ResolveValueContext = {
    values: baseValues,
    filterApplied: false,
    minAllowed: KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
    highestValue: 0,
    player1Value: 0,
    player2Value: 0,
  };

  if (!input.doc || input.progressMode !== 'cumulative' || !input.statKey) {
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

  const player1Value = readPlayerStat(input.doc, player1Ref, resolvedStatKey);
  const player2Value = readPlayerStat(input.doc, player2Ref, resolvedStatKey);
  const highestValue = Math.max(player1Value, player2Value, 0);
  const minAllowed = Math.max(KING_OF_THE_HILL_MIN_RESOLVE_VALUE, Math.floor(highestValue) + 1);
  const filteredValues = baseValues.filter((value) => value >= minAllowed);

  return {
    values: filteredValues,
    filterApplied: true,
    minAllowed,
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
    )}) already exceed the maximum of ${KING_OF_THE_HILL_MAX_RESOLVE_VALUE}. Pick different players or stats.`;
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
