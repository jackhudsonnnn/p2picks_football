import { getPlayerStat } from '../../../../services/leagueData';
import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../../types';
import type { LeaguePlayer } from '../../../../services/leagueData/types';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import { formatNumber } from '../../../../utils/number';
import {
  NBA_PROP_HUNT_ALLOWED_RESOLVE_AT,
  NBA_PROP_HUNT_STAT_KEY_LABELS,
  NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY,
  NBA_PROP_HUNT_LINE_RANGE,
} from './constants';
import { buildProgressModeStep, getDefaultProgressPatch, loadGameContext } from '../../utils/userConfigBuilder';

export async function buildNbaPropHuntUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const league = input.league ?? 'NBA';
  const gameId = resolveGameId(input as GameContextInput) ?? '';
  const context = await loadGameContext(league, gameId);
  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);

  const statChoices: ModeUserConfigChoice[] = Object.entries(NBA_PROP_HUNT_STAT_KEY_LABELS).map(([key, label]) => ({
    id: key,
    value: key,
    label,
    patch: { stat: key, stat_label: label, ...defaultProgressPatch },
    clears: ['player_id', 'player_name', 'line', 'line_value', 'line_label'],
  }));

  const players: LeaguePlayer[] = context.players;
  const playerChoices: ModeUserConfigChoice[] = players.map((p: LeaguePlayer) => ({
    id: p.playerId,
    value: p.playerId,
    label: p.fullName,
    description: p.position,
    patch: { player_id: p.playerId, player_name: p.fullName },
  }));

  const resolveChoices: ModeUserConfigChoice[] = NBA_PROP_HUNT_ALLOWED_RESOLVE_AT.map((v) => ({
    id: v,
    value: v,
    label: v,
    patch: { resolve_at: v },
  }));

  // Determine current stat and preferred progress mode for line generation
  const statKey = typeof input.config?.stat === 'string' ? input.config?.stat : null;
  const progressModeForLines: 'starting_now' | 'cumulative' = context.showProgressStep
    ? (typeof input.config?.progress_mode === 'string' && input.config.progress_mode.trim().toLowerCase() === 'cumulative' ? 'cumulative' : 'starting_now')
    : 'starting_now';

  const currentStat = gameId && statKey && input.config ? await getCurrentStatValue(league, gameId, input.config ?? {}) : null;

  const lineChoices = await buildLineChoices(input.config ?? {}, currentStat, progressModeForLines, statKey);

  const steps: ModeUserConfigStep[] = [
    { key: 'stat', title: 'Select Stat', inputType: 'select', choices: statChoices },
    { key: 'player', title: 'Select Player', inputType: 'select', choices: playerChoices },
    { key: 'resolve_at', title: 'Resolve At', inputType: 'select', choices: resolveChoices },
    { key: 'line', title: 'Set Line', inputType: 'select', choices: lineChoices },
  ];

  const progressStep = buildProgressModeStep({
    showProgressStep: context.showProgressStep,
    startingNowDescription: 'Capture current stat as baseline.',
    cumulativeDescription: 'Use full-game totals.',
    clearsOnChange: ['line', 'line_value', 'line_label'],
    clearStepsOnChange: ['line'],
  });

  if (progressStep) {
    steps.splice(3, 0, progressStep);
  }

  return steps;
}

async function buildLineChoices(
  existingConfig: Record<string, unknown>,
  currentStat: number | null,
  progressMode: 'starting_now' | 'cumulative',
  statKey: string | null,
): Promise<ModeUserConfigChoice[]> {
  const { min, max, step } = NBA_PROP_HUNT_LINE_RANGE;
  const choices: ModeUserConfigChoice[] = [];

  const minimumBase = progressMode === 'starting_now' ? min : currentStat != null ? currentStat + 0.5 : min;
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
    // Only include values that end in .5 to avoid ties (validator requires .5)
    const scaled = Math.round(numeric * 2);
    if (Math.abs(scaled) % 2 !== 1) continue;
    const label = numeric.toFixed(1);
    choices.push({
      id: label,
      value: label,
      label,
      patch: { line: label, line_value: numeric, line_label: label },
    });
  }

  // include current stat as hint if available
  // include current stat as hint if available
  const gameId = typeof existingConfig.league_game_id === 'string' ? existingConfig.league_game_id : '';
  if (gameId && statKey && existingConfig.player_id) {
    try {
      const category = NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey] || 'stats';
      const stat = await getPlayerStat('NBA', gameId, String(existingConfig.player_id), category, statKey);
      if (Number.isFinite(stat)) {
        const num = Number(stat);
        // ensure suggested line ends in .5 and sits above current stat if needed
        const base = Math.floor(num * 2);
        const suggested = (base % 2 === 0 ? base + 1 : base) / 2;
        const label = formatNumber(suggested);
        if (!choices.find((c) => c.value === label)) {
          choices.unshift({
            id: `current-${label}`,
            value: label,
            label: `${label} (near current ${formatNumber(num)})`,
            patch: { line: label, line_value: suggested, line_label: label },
          });
        }
      }
    } catch (err) {
      // ignore
    }
  }

  return choices;
}

async function getCurrentStatValue(league: string, gameId: string, config: Record<string, unknown>): Promise<number | null> {
  const statKey = typeof config.stat === 'string' ? config.stat : '';
  if (!statKey || !NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey]) return null;
  const playerKey = typeof config.player_id === 'string' && config.player_id
    ? String(config.player_id)
    : typeof config.player_name === 'string' && config.player_name
    ? `name:${String(config.player_name)}`
    : null;
  if (!playerKey) return null;
  try {
    const category = NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey] || 'stats';
    const value = await getPlayerStat('NBA', gameId, playerKey, category, statKey);
    return Number.isFinite(value) ? Number(value) : null;
  } catch (err) {
    return null;
  }
}
