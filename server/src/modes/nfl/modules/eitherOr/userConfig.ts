/**
 * Either Or - User Configuration Builder
 * Uses shared UserConfigBuilder utilities.
 */

import type { ModeUserConfigStep } from '../../shared/types';
import {
  loadGameContext,
  buildStatStep,
  buildPlayerStep,
  buildResolveAtStep,
  buildProgressModeStep,
  getDefaultProgressPatch,
  filterPlayersByStatPosition,
} from '../../shared/userConfigBuilder';
import { prepareValidPlayers } from '../../shared/playerUtils';
import {
  ALLOWED_RESOLVE_AT,
  DEFAULT_RESOLVE_AT,
  STAT_KEY_TO_CATEGORY,
  STAT_KEY_LABELS,
} from '../../shared/statConstants';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import type { BuildUserConfigInput } from '../../shared/types';

export async function buildEitherOrUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const gameId = resolveGameId(input as GameContextInput);
  const league = input.league ?? 'NFL';
  const context = await loadGameContext(league, gameId);
  const statKey = input.config?.stat as string | undefined;

  // Filter players by position based on stat
  const filteredPlayers = filterPlayersByStatPosition(context.players, statKey);
  const preparedPlayers = prepareValidPlayers(filteredPlayers);

  const defaultProgressPatch = getDefaultProgressPatch(context.showProgressStep);

  const steps: ModeUserConfigStep[] = [];

  // Stat step
  steps.push(
    buildStatStep({
      statKeyToCategory: STAT_KEY_TO_CATEGORY,
      statKeyLabels: STAT_KEY_LABELS,
      defaultResolveAt: DEFAULT_RESOLVE_AT,
      skipResolveStep: context.skipResolveStep,
      defaultProgressPatch,
      clearsOnChange: ['player1_id', 'player1_name', 'player2_id', 'player2_name', 'player_id', 'player_name'],
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

  // Resolve at step (if not skipped)
  if (!context.skipResolveStep) {
    steps.push(buildResolveAtStep({ allowedValues: ALLOWED_RESOLVE_AT }));
  }

  // Progress mode step (if game is in progress)
  const progressStep = buildProgressModeStep({
    showProgressStep: context.showProgressStep,
    startingNowDescription: 'Capture baselines when betting closes; whoever gains the most afterward wins.',
    cumulativeDescription: 'Skip baselines and compare full-game totals at the resolve time.',
  });
  if (progressStep) {
    steps.push(progressStep);
  }

  return steps;
}
