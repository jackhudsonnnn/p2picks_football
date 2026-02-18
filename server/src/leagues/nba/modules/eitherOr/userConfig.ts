import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep, PlayerRecord } from '../../../sharedUtils/types';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT, NBA_STAT_KEY_LABELS } from '../../utils/statConstants';
import { buildProgressModeStep, getDefaultProgressPatch, loadGameContext } from '../../utils/userConfigBuilder';

export async function buildEitherOrUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const league = input.league ?? 'NBA';
  const gameId = resolveGameId(input as GameContextInput) ?? '';
  const context = await loadGameContext(league, gameId);
  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);

  const statChoices: ModeUserConfigChoice[] = Object.entries(NBA_STAT_KEY_LABELS).map(([key, label]) => ({
    id: key,
    value: key,
    label,
    patch: { stat: key, stat_label: label, ...defaultProgressPatch },
    clears: ['player1_id', 'player1_name', 'player2_id', 'player2_name'],
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

  const resolveChoices: ModeUserConfigChoice[] = ALLOWED_RESOLVE_AT.map((v) => ({
    id: v,
    value: v,
    label: v,
    patch: { resolve_at: v },
  }));

  const steps: ModeUserConfigStep[] = [
    { key: 'stat', title: 'Select Stat', inputType: 'select', choices: statChoices },
  { key: 'player1', title: 'Select Player 1', inputType: 'select', choices: player1Choices },
  { key: 'player2', title: 'Select Player 2', inputType: 'select', choices: player2Choices },
    { key: 'resolve_at', title: 'Resolve At', inputType: 'select', choices: resolveChoices },
  ];

  const progressStep = buildProgressModeStep({
    showProgressStep: context.showProgressStep,
    startingNowDescription: 'Capture baselines when betting closes.',
    cumulativeDescription: 'Compare total stats at resolve time.',
  });

  if (progressStep) {
    steps.push(progressStep);
  }

  return steps;
}
