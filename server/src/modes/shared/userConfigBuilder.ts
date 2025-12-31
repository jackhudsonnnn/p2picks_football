/**
 * UserConfigBuilder - Shared utility for building mode user configuration steps.
 * Extracts common patterns from eitherOr, kingOfTheHill, propHunt, etc.
 */

import { getGameDoc, type RefinedGameDoc } from '../../services/nflRefinedDataService';
import { prepareValidPlayers, sortPlayersByPositionAndName } from './playerUtils';
import { shouldSkipResolveStep } from './resolveUtils';
import { getValidPositionsForStat } from './statMappings';
import type { ModeUserConfigChoice, ModeUserConfigStep, PlayerRecord } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UserConfigBuildInput {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}

export interface GameContext {
  doc: RefinedGameDoc | null;
  players: PlayerRecord[];
  status: string | null;
  period: number | null;
  skipResolveStep: boolean;
  showProgressStep: boolean;
}

export interface StatChoiceOptions {
  statKeyToCategory: Record<string, string>;
  statKeyLabels: Record<string, string>;
  defaultResolveAt?: string;
  skipResolveStep: boolean;
  defaultProgressPatch: Record<string, unknown>;
  clearsOnChange?: string[];
  clearStepsOnChange?: string[];
}

export interface PlayerChoiceOptions {
  players: PlayerRecord[];
  playerKey: 'player' | 'player1' | 'player2';
  statKey?: string | null;
}

export interface ResolveAtOptions {
  allowedValues: string[];
}

export interface ProgressModeOptions {
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
 * Load game context including doc and player list.
 */
export async function loadGameContext(gameId: string | null | undefined): Promise<GameContext> {
  if (!gameId) {
    return {
      doc: null,
      players: [],
      status: null,
      period: null,
      skipResolveStep: false,
      showProgressStep: false,
    };
  }

  try {
    const doc = await getGameDoc(gameId);
    if (!doc || !Array.isArray(doc.teams)) {
      return {
        doc,
        players: [],
        status: doc?.status ?? null,
        period: doc?.period ?? null,
        skipResolveStep: shouldSkipResolveStep(doc),
        showProgressStep: false,
      };
    }

    const players = extractPlayersFromDoc(doc);
    const status = typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : null;
    const showProgressStep = Boolean(status && status !== 'STATUS_SCHEDULED');

    return {
      doc,
      players: sortPlayersByPositionAndName(players),
      status,
      period: doc.period ?? null,
      skipResolveStep: shouldSkipResolveStep(doc),
      showProgressStep,
    };
  } catch (err) {
    console.warn('[userConfigBuilder] failed to load game context', {
      gameId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      doc: null,
      players: [],
      status: null,
      period: null,
      skipResolveStep: false,
      showProgressStep: false,
    };
  }
}

function extractPlayersFromDoc(doc: RefinedGameDoc): PlayerRecord[] {
  const records: PlayerRecord[] = [];
  const seen = new Set<string>();

  for (const team of doc.teams as any[]) {
    if (!team) continue;
    const teamName = team.abbreviation || team.name || '';
    const rawPlayers = team.players;
    if (!rawPlayers) continue;

    const pushRecord = (player: any) => {
      if (!player) return;
      const id: string | undefined = player.athleteId || player.id || undefined;
      if (!id) return;
      if (seen.has(id)) return;
      seen.add(id);
      records.push({
        id: String(id),
        name: String(player.fullName || player.name || id),
        team: String(teamName || ''),
        position: player.position || player.pos || null,
      });
    };

    if (Array.isArray(rawPlayers)) {
      rawPlayers.forEach(pushRecord);
    } else if (typeof rawPlayers === 'object') {
      Object.values(rawPlayers).forEach(pushRecord);
    }
  }

  return records;
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
export function formatPlayerLabel(player: PlayerRecord): string {
  const pieces = [player.name];
  if (player.team) pieces.push(player.team);
  if (player.position) pieces.push(player.position);
  return pieces.join(' • ');
}

/**
 * Convert camelCase/snake_case stat keys to readable labels.
 */
export function humanizeStatKey(key: string): string {
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
 * Create a map of players by ID for quick lookup.
 */
export function playersById(players: PlayerRecord[]): Record<string, PlayerRecord> {
  return players.reduce<Record<string, PlayerRecord>>((map, player) => {
    map[player.id] = player;
    return map;
  }, {});
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
