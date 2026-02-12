/**
 * UserConfigBuilder - Shared utility for building mode user configuration steps.
 * Extracts common patterns from eitherOr, kingOfTheHill, propHunt, etc.
 */

import { getGameStatus, getGamePeriod, getAllPlayerRecords } from '../../../services/leagueData';
import type { League } from '../../../types/league';
import { prepareValidPlayers, sortPlayersByPositionAndName } from './playerUtils';
import { shouldSkipResolveStep } from '../../sharedUtils/resolveUtils';
import { getValidPositionsForStat } from './statMappings';
import type { ModeUserConfigChoice, ModeUserConfigStep, PlayerRecord } from '../../sharedUtils/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GameContext {
  players: PlayerRecord[];
  status: string | null;
  period: number | null;
  skipResolveStep: boolean;
  showProgressStep: boolean;
}

interface StatChoiceOptions {
  statKeyToCategory: Record<string, string>;
  statKeyLabels: Record<string, string>;
  defaultResolveAt?: string;
  skipResolveStep: boolean;
  defaultProgressPatch: Record<string, unknown>;
  clearsOnChange?: string[];
  clearStepsOnChange?: string[];
}

interface PlayerChoiceOptions {
  players: PlayerRecord[];
  playerKey: 'player' | 'player1' | 'player2';
  statKey?: string | null;
}

interface ResolveAtOptions {
  allowedValues: string[];
}

interface ProgressModeOptions {
  showProgressStep: boolean;
  startingNowDescription?: string;
  cumulativeDescription?: string;
  clearsOnChange?: string[];
  clearStepsOnChange?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Context Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load game context.
 */
export async function loadGameContext(
  league: League,
  gameId: string | null | undefined,
): Promise<GameContext> {
  if (!gameId) {
    return {
      players: [],
      status: null,
      period: null,
      skipResolveStep: false,
      showProgressStep: false,
    };
  }

  const players = await getAllPlayerRecords(league, gameId);
  const status = await getGameStatus(league, gameId);
  const period = await getGamePeriod(league, gameId);
  const showProgressStep = Boolean(status && status !== 'STATUS_SCHEDULED');
  const skip = await shouldSkipResolveStep(league, gameId);

  return {
    players: sortPlayersByPositionAndName(players),
    status,
    period,
    skipResolveStep: skip,
    showProgressStep,
  };
}

export function buildStatStep(options: StatChoiceOptions): ModeUserConfigStep {
  const choices: ModeUserConfigChoice[] = Object.keys(options.statKeyToCategory)
    .sort()
    .map((statKey) => {
      const label = options.statKeyLabels[statKey] ?? humanizeStatKey(statKey);
      return {
        id: statKey,
        value: statKey,
        label,
        clears: options.clearsOnChange ?? [],
        clearSteps: options.clearStepsOnChange ?? [],
        patch: {
          stat: statKey,
          stat_label: label,
          ...(options.skipResolveStep && options.defaultResolveAt
            ? { resolve_at: options.defaultResolveAt }
            : {}),
          ...options.defaultProgressPatch,
        },
      };
    });

  return {
    key: 'stat',
    title: 'Select Stat',
    inputType: 'select',
    choices,
  };
}

/**
 * Build player selection step.
 */
export function buildPlayerStep(options: PlayerChoiceOptions): ModeUserConfigStep {
  const { players, playerKey, statKey } = options;

  // Filter by valid positions if stat is selected
  const validPositions = getValidPositionsForStat(statKey);
  const filteredPlayers = validPositions
    ? players.filter((p) => p.position && validPositions.includes(p.position))
    : players;

  const preparedPlayers = prepareValidPlayers(filteredPlayers);

  const choices: ModeUserConfigChoice[] = preparedPlayers.map((player) => {
    const patchKey = playerKey === 'player' ? 'player' : playerKey;
    return {
      id: player.id,
      value: player.id,
      label: formatPlayerLabel(player),
      patch: {
        [`${patchKey}_id`]: player.id,
        [`${patchKey}_name`]: player.name,
        [`${patchKey}_team_name`]: player.team ?? null,
        [`${patchKey}_team`]: player.team ?? null,
      },
    };
  });

  const titleMap: Record<string, string> = {
    player: 'Select Player',
    player1: 'Select Player 1',
    player2: 'Select Player 2',
  };

  return {
    key: playerKey,
    title: titleMap[playerKey] ?? 'Select Player',
    inputType: 'select',
    choices,
  };
}

/**
 * Build resolve_at selection step.
 */
export function buildResolveAtStep(options: ResolveAtOptions): ModeUserConfigStep {
  const choices: ModeUserConfigChoice[] = options.allowedValues.map((value) => ({
    id: value,
    value,
    label: value,
    patch: { resolve_at: value },
  }));

  return {
    key: 'resolve_at',
    title: 'Resolve At',
    inputType: 'select',
    choices,
  };
}

/**
 * Build progress mode selection step.
 */
export function buildProgressModeStep(options: ProgressModeOptions): ModeUserConfigStep | null {
  if (!options.showProgressStep) return null;

  const choices: ModeUserConfigChoice[] = [
    {
      id: 'starting_now',
      value: 'starting_now',
      label: 'Starting Now',
      description:
        options.startingNowDescription ??
        'Capture baselines when betting closes; whoever gains the most afterward wins.',
      patch: { progress_mode: 'starting_now' },
      clears: options.clearsOnChange,
      clearSteps: options.clearStepsOnChange,
    },
    {
      id: 'cumulative',
      value: 'cumulative',
      label: 'Cumulative',
      description:
        options.cumulativeDescription ??
        'Skip baselines and compare full-game totals at the resolve time.',
      patch: { progress_mode: 'cumulative' },
      clears: options.clearsOnChange,
      clearSteps: options.clearStepsOnChange,
    },
  ];

  return {
    key: 'progress_mode',
    title: 'Track Progress',
    inputType: 'select',
    choices,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a player for display in the UI.
 */
function formatPlayerLabel(player: PlayerRecord): string {
  const pieces = [player.name];
  if (player.team) pieces.push(player.team);
  if (player.position) pieces.push(player.position);
  return pieces.join(' • ');
}

/**
 * Convert camelCase/snake_case stat keys to readable labels.
 */
function humanizeStatKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withSpaces) return key;
  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

/**
 * Filter players by position based on selected stat.
 */
export function filterPlayersByStatPosition(
  players: PlayerRecord[],
  statKey: string | null | undefined,
): PlayerRecord[] {
  const validPositions = getValidPositionsForStat(statKey);
  if (!validPositions) return players;
  return players.filter((p) => p.position && validPositions.includes(p.position));
}

/**
 * Normalize progress mode from config value.
 */
export function normalizeProgressMode(value: unknown): 'starting_now' | 'cumulative' {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'cumulative') {
    return 'cumulative';
  }
  return 'starting_now';
}

/**
 * Get the default progress patch based on whether progress step is shown.
 */
export function getDefaultProgressPatch(showProgressStep: boolean): Record<string, unknown> {
  return showProgressStep ? {} : { progress_mode: 'starting_now' };
}
