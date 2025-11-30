import { loadRefinedGame, type RefinedGameDoc } from '../../../utils/gameData';
import { prepareValidPlayers, sortPlayersByPositionAndName } from '../../shared/playerUtils';
import { getValidPositionsForStat } from '../../shared/statMappings';
import type { PlayerRef } from '../../shared/playerStatUtils';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import {
  KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
  KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  KING_OF_THE_HILL_MAX_RESOLVE_VALUE,
  KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
} from './constants';
import { readPlayerStat, resolveStatKey, type KingOfTheHillConfig } from './evaluator';

type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position?: string | null;
};

export async function buildKingOfTheHillUserConfig(input: {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ModeUserConfigStep[]> {
  const debug = process.env.DEBUG_KING_OF_THE_HILL === '1' || process.env.DEBUG_KING_OF_THE_HILL === 'true';
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const { doc, players } = await loadGameContext(gameId);
  const preparedPlayers = prepareValidPlayers(players);
  const normalizedStatus = typeof doc?.status === 'string' ? doc.status.trim().toUpperCase() : null;
  const showProgressStep = Boolean(normalizedStatus && normalizedStatus !== 'STATUS_SCHEDULED');

  const statKey = input.existingConfig?.stat as string | undefined;
  const selectedProgressMode = parseProgressModeSelection(input.existingConfig?.progress_mode);
  const validPositions = getValidPositionsForStat(statKey);

  if (debug) {
    console.log('[kingOfTheHill][userConfig] filtering players', {
      existingConfig: input.existingConfig,
      statKey,
      validPositions,
      totalPlayers: preparedPlayers.length,
    });
  }

  const filteredPlayers = preparedPlayers.filter((player) => {
    if (!validPositions) return true;
    return player.position && validPositions.includes(player.position);
  });

  if (debug) {
    console.log('[kingOfTheHill][userConfig] building steps', {
      gameId,
      playerCount: players.length,
      validPlayerCount: preparedPlayers.length,
      filteredPlayerCount: filteredPlayers.length,
      statKey,
      status: doc?.status ?? null,
      period: doc?.period ?? null,
      showProgressStep,
      selectedProgressMode,
    });
  }

  const playerMap = playersById(filteredPlayers);
  const basePlayerChoices = filteredPlayers.map((player) => ({
    value: player.id,
    label: formatPlayerLabel(player),
  }));

  const player1Choices: ModeUserConfigChoice[] = basePlayerChoices.map((choice) => ({
    id: choice.value,
    value: choice.value,
    label: choice.label,
    patch: {
      player1_id: choice.value,
      player1_name: playerMap[choice.value]?.name ?? choice.label,
      player1_team_name: playerMap[choice.value]?.team ?? null,
      player1_team: playerMap[choice.value]?.team ?? null,
    },
  }));

  const player2Choices: ModeUserConfigChoice[] = basePlayerChoices.map((choice) => ({
    id: choice.value,
    value: choice.value,
    label: choice.label,
    patch: {
      player2_id: choice.value,
      player2_name: playerMap[choice.value]?.name ?? choice.label,
      player2_team_name: playerMap[choice.value]?.team ?? null,
      player2_team: playerMap[choice.value]?.team ?? null,
    },
  }));

  const defaultProgressPatch = showProgressStep ? {} : { progress_mode: 'starting_now' };

  const statChoices: ModeUserConfigChoice[] = Object.keys(KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY)
    .sort()
    .map((statKeyValue) => {
      const label = KING_OF_THE_HILL_STAT_KEY_LABELS[statKeyValue] ?? humanizeStatKey(statKeyValue);
      return {
        id: statKeyValue,
        value: statKeyValue,
        label,
        clears: ['player1_id', 'player1_name', 'player2_id', 'player2_name'],
        clearSteps: ['player1', 'player2'],
        patch: {
          stat: statKeyValue,
          stat_label: label,
          ...defaultProgressPatch,
        },
      } satisfies ModeUserConfigChoice;
    });

  const resolveValueFilterContext = computeResolveValueFilter({
    doc,
    statKey,
    progressMode: selectedProgressMode,
    existingConfig: input.existingConfig,
  });

  let resolveValueChoices: ModeUserConfigChoice[] = resolveValueFilterContext.values.map((value) => ({
    id: String(value),
    value: String(value),
    label: String(value),
    patch: {
      resolve_value: value,
      resolve_value_label: String(value),
    },
  }));

  if (!resolveValueChoices.length) {
    resolveValueChoices = [
      {
        id: 'resolve_value_unavailable',
        value: 'resolve_value_unavailable',
        label: 'No valid resolve values available',
        description: 'Both players already surpassed the maximum allowed for this stat. Pick different players or a new stat.',
        disabled: true,
      },
    ];
  }

  const resolveValueStepDescription = buildResolveValueDescription(resolveValueFilterContext, input.existingConfig);

  if (debug && resolveValueFilterContext.filterApplied) {
    console.log('[kingOfTheHill][userConfig] resolve value filtering applied', {
      highestValue: resolveValueFilterContext.highestValue,
      minAllowed: resolveValueFilterContext.minAllowed,
      availableChoices: resolveValueFilterContext.values.length,
    });
  }

  const steps: ModeUserConfigStep[] = [
    {
      key: 'stat',
      title: 'Select Stat',
      inputType: 'select',
      choices: statChoices,
    },
    {
      key: 'player1',
      title: 'Select Player 1',
      inputType: 'select',
      choices: player1Choices,
    },
    {
      key: 'player2',
      title: 'Select Player 2',
      inputType: 'select',
      choices: player2Choices,
    },
  ];

  if (showProgressStep) {
    const progressModeChoices: ModeUserConfigChoice[] = [
      {
        id: 'starting_now',
        value: 'starting_now',
        label: 'Starting Now',
        description: 'Capture current stats when betting closes; players must add the full resolve value from that snapshot.',
        patch: { progress_mode: 'starting_now' },
      },
      {
        id: 'cumulative',
        value: 'cumulative',
        label: 'Cumulative',
        description: 'Use total game stats; the first player to hit the resolve value overall wins.',
        patch: { progress_mode: 'cumulative' },
      },
    ];
    steps.push({
      key: 'progress_mode',
      title: 'Track Progress',
      inputType: 'select',
      choices: progressModeChoices,
    });

    const resolveValueStep: ModeUserConfigStep = {
      key: 'resolve_value',
      title: 'Resolve Value',
      inputType: 'select',
      description: resolveValueStepDescription,
      choices: resolveValueChoices,
    };
    steps.push(resolveValueStep);
  }

  if (debug) {
    console.log('[kingOfTheHill][userConfig] steps prepared', {
      gameId,
      stepCount: steps.length,
      defaultResolveValue: KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
    });
  }

  return steps;
}

async function loadGameContext(gameId: string): Promise<{ doc: RefinedGameDoc | null; players: PlayerRecord[] }> {
  if (!gameId) {
    return { doc: null, players: [] };
  }
  try {
    const doc = await loadRefinedGame(gameId);
    if (!doc || !Array.isArray(doc.teams)) {
      if (process.env.DEBUG_KING_OF_THE_HILL === '1' || process.env.DEBUG_KING_OF_THE_HILL === 'true') {
        console.warn('[kingOfTheHill][userConfig] missing teams in refined game doc', { gameId });
      }
      return { doc, players: [] };
    }

    const records: PlayerRecord[] = [];
    const seen = new Set<string>();

    for (const team of doc.teams as any[]) {
      if (!team) continue;
      const teamName = team.abbreviation || team.name || '';
      const rawPlayers = (team as any).players;
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

    return { doc, players: sortPlayersByPositionAndName(records) };
  } catch (err) {
    console.warn('[kingOfTheHill] failed to load player records', { gameId, error: (err as Error).message });
    return { doc: null, players: [] };
  }
}

function playersById(players: PlayerRecord[]): Record<string, PlayerRecord> {
  return players.reduce<Record<string, PlayerRecord>>((map, player) => {
    map[player.id] = player;
    return map;
  }, {});
}

function formatPlayerLabel(player: PlayerRecord): string {
  const pieces = [player.name];
  if (player.team) pieces.push(player.team);
  if (player.position) pieces.push(player.position);
  return pieces.join(' • ');
}

function humanizeStatKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
  if (!withSpaces) return key;
  return withSpaces
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

type ResolveValueFilterContext = {
  values: number[];
  filterApplied: boolean;
  minAllowed: number;
  highestValue: number;
  player1Value: number;
  player2Value: number;
};

function computeResolveValueFilter(input: {
  doc: RefinedGameDoc | null;
  statKey?: string;
  progressMode: 'starting_now' | 'cumulative' | null;
  existingConfig?: Record<string, unknown>;
}): ResolveValueFilterContext {
  const baseValues = [...KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES];
  const defaultResult: ResolveValueFilterContext = {
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
  context: ResolveValueFilterContext,
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
  if (Number.isInteger(value)) {
    return String(value);
  }
  if (Number.isFinite(value)) {
    return value.toFixed(1);
  }
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
