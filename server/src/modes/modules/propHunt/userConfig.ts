/**
 * Prop Hunt - User Configuration Builder
 * Uses shared UserConfigBuilder utilities.
 */

import { getPlayer } from '../../../services/nflData/nflRefinedDataAccessors';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import {
  loadGameContext,
  buildStatStep,
  buildPlayerStep,
  buildResolveAtStep,
  buildProgressModeStep,
  getDefaultProgressPatch,
  filterPlayersByStatPosition,
  normalizeProgressMode,
} from '../../shared/userConfigBuilder';
import { prepareValidPlayers } from '../../shared/playerUtils';
import {
  PROP_HUNT_ALLOWED_RESOLVE_AT,
  PROP_HUNT_DEFAULT_RESOLVE_AT,
  STAT_KEY_LABELS,
  STAT_KEY_TO_CATEGORY,
  getStatRange,
} from './constants';

const DEBUG = process.env.DEBUG_PROP_HUNT === '1' || process.env.DEBUG_PROP_HUNT === 'true';

export async function buildPropHuntUserConfig(input: {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ModeUserConfigStep[]> {
  const gameId = input.nflGameId ? String(input.nflGameId) : null;
  const context = await loadGameContext(gameId);
  const statKey = input.existingConfig?.stat as string | undefined;
  const currentStat = gameId ? await getCurrentStatValue(gameId, input.existingConfig ?? {}) : null;
  const progressModeForLines = context.showProgressStep
    ? normalizeProgressMode(input.existingConfig?.progress_mode)
    : 'starting_now';

  // Filter players by position based on stat
  const filteredPlayers = filterPlayersByStatPosition(context.players, statKey);
  const preparedPlayers = prepareValidPlayers(filteredPlayers);

  if (DEBUG) {
    console.log('[propHunt][userConfig] building steps', {
      gameId,
      playerCount: context.players.length,
      filteredPlayerCount: preparedPlayers.length,
      statKey,
      skipResolveStep: context.skipResolveStep,
      showProgressStep: context.showProgressStep,
    });
  }

  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);

  const steps: ModeUserConfigStep[] = [];

  // Stat step
  steps.push(
    buildStatStep({
      statKeyToCategory: STAT_KEY_TO_CATEGORY,
      statKeyLabels: STAT_KEY_LABELS,
      defaultResolveAt: PROP_HUNT_DEFAULT_RESOLVE_AT,
      skipResolveStep: context.skipResolveStep,
      defaultProgressPatch,
      clearsOnChange: ['player_id', 'player_name', 'line', 'line_value', 'line_label'],
      clearStepsOnChange: ['player', 'line'],
    }),
  );

  // Player step
  steps.push(
    buildPlayerStep({
      players: preparedPlayers,
      playerKey: 'player',
      statKey,
    }),
  );

  // Resolve at step (if not skipped)
  if (!context.skipResolveStep) {
    steps.push(buildResolveAtStep({ allowedValues: PROP_HUNT_ALLOWED_RESOLVE_AT }));
  }

  // Progress mode step (if game is in progress)
  if (context.showProgressStep) {
    const progressStep = buildProgressModeStep({
      showProgressStep: true,
      startingNowDescription: 'Capture the current stat when betting closes; the player must add the entire line afterward.',
      cumulativeDescription: 'Use full-game totals and compare the total stat to the line.',
      clearsOnChange: ['line', 'line_value', 'line_label'],
      clearStepsOnChange: ['line'],
    });
    if (progressStep) {
      steps.push(progressStep);
    }
  }

  // Line step
  steps.push(buildLineStep(input.existingConfig ?? {}, currentStat, progressModeForLines, statKey));

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line Step Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildLineStep(
  existingConfig: Record<string, unknown>,
  currentStat: number | null,
  progressMode: 'starting_now' | 'cumulative',
  statKey?: string,
): ModeUserConfigStep {
  const choices = buildLineChoices(existingConfig, currentStat, progressMode, statKey);
  return {
    key: 'line',
    title: 'Set Line',
    inputType: 'select',
    choices,
  };
}

function buildLineChoices(
  existingConfig: Record<string, unknown>,
  currentStat: number | null,
  progressMode: 'starting_now' | 'cumulative',
  statKey?: string,
): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];
  const { min, max, step } = getStatRange(statKey);
  
  const minimumBase =
    progressMode === 'starting_now'
      ? min
      : currentStat != null
        ? currentStat + 0.5
        : min;
  const start = Math.max(min, Math.ceil(minimumBase * 2) / 2);

  if (start > max) {
    return [
      {
        id: 'unavailable',
        value: 'unavailable',
        label: 'No valid lines available',
        description: `The selected stat already exceeds the maximum supported line (${max}).`,
        disabled: true,
      },
    ];
  }

  for (let value = start; value <= max; value += step) {
    const numeric = Number(value.toFixed(1));
    const label = numeric.toFixed(1);
    choices.push({
      id: label,
      value: label,
      label,
      patch: {
        line: label,
        line_value: numeric,
        line_label: label,
      },
    });
  }

  // Include current line if not in choices
  const currentLine = extractLine(existingConfig);
  if (currentLine && !choices.find((choice) => choice.value === currentLine)) {
    choices.unshift({
      id: currentLine,
      value: currentLine,
      label: currentLine,
      patch: {
        line: currentLine,
        line_value: Number.parseFloat(currentLine),
        line_label: currentLine,
      },
    });
  }

  return choices;
}

function extractLine(config: Record<string, unknown>): string | null {
  const line = typeof config.line === 'string' ? config.line.trim() : '';
  if (line) return line;
  const value = typeof config.line_value === 'number' && Number.isFinite(config.line_value)
    ? config.line_value
    : null;
  if (value == null) return null;
  return value.toFixed(1);
}

async function getCurrentStatValue(gameId: string, config: Record<string, unknown>): Promise<number | null> {
  const statKey = typeof config.stat === 'string' ? config.stat : '';
  if (!statKey || !STAT_KEY_TO_CATEGORY[statKey]) {
    return null;
  }
  const ref = {
    id: typeof config.player_id === 'string' ? config.player_id : null,
    name: typeof config.player_name === 'string' ? config.player_name : null,
  };
  return extractPlayerStat(gameId, statKey, ref);
}

async function extractPlayerStat(
  gameId: string,
  statKey: string,
  ref: { id?: string | null; name?: string | null },
): Promise<number | null> {
  const category = STAT_KEY_TO_CATEGORY[statKey];
  if (!category) return null;
  const player = await lookupPlayer(gameId, ref);
  if (!player) return null;
  const stats = ((player as any).stats || {}) as Record<string, Record<string, unknown>>;
  const categoryStats = stats ? (stats[category] as Record<string, unknown>) : undefined;
  if (!categoryStats) return null;
  return normalizeStatValue(categoryStats[statKey]);
}

async function lookupPlayer(gameId: string, ref: { id?: string | null; name?: string | null }) {
  if (ref.id) {
    const byId = await getPlayer(gameId, String(ref.id));
    if (byId) return byId;
  }
  if (ref.name) {
    const byName = await getPlayer(gameId, `name:${ref.name}`);
    if (byName) return byName;
  }
  return null;
}

function normalizeStatValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const first = raw.split('/')[0];
    const num = Number(first);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}
