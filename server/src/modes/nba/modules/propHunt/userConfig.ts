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

  const lineChoices = await buildLineChoices(input.config ?? {}, league, gameId);

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
  league: string,
  gameId: string,
): Promise<ModeUserConfigChoice[]> {
  const statKey = typeof existingConfig.stat === 'string' ? existingConfig.stat : null;
  const { min, max, step } = NBA_PROP_HUNT_LINE_RANGE;
  const start = min;
  const choices: ModeUserConfigChoice[] = [];
  for (let value = start; value <= max; value += step) {
    const numeric = Number(value.toFixed(1));
    const label = numeric.toFixed(1);
    choices.push({
      id: label,
      value: label,
      label,
      patch: { line: label, line_value: numeric, line_label: label },
    });
  }

  // include current stat as hint if available
  if (gameId && statKey && existingConfig.player_id) {
    try {
      const category = NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey] || 'stats';
      const stat = await getPlayerStat('NBA', gameId, String(existingConfig.player_id), category, statKey);
      if (Number.isFinite(stat)) {
        const num = Number(stat);
        const suggested = (Math.floor(num * 2) + 1) / 2;
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
