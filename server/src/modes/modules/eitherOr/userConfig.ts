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
  EITHER_OR_ALLOWED_RESOLVE_AT,
  EITHER_OR_DEFAULT_RESOLVE_AT,
  STAT_KEY_TO_CATEGORY,
  STAT_KEY_LABELS,
} from './constants';

const DEBUG = process.env.DEBUG_EITHER_OR === '1' || process.env.DEBUG_EITHER_OR === 'true';

export async function buildEitherOrUserConfig(input: {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}): Promise<ModeUserConfigStep[]> {
  const gameId = input.nflGameId ? String(input.nflGameId) : null;
  const context = await loadGameContext(gameId);
  const statKey = input.existingConfig?.stat as string | undefined;

  // Filter players by position based on stat
  const filteredPlayers = filterPlayersByStatPosition(context.players, statKey);
  const preparedPlayers = prepareValidPlayers(filteredPlayers);

  if (DEBUG) {
    console.log('[eitherOr][userConfig] building steps', {
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
      defaultResolveAt: EITHER_OR_DEFAULT_RESOLVE_AT,
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
  steps.push(
    buildPlayerStep({
      players: preparedPlayers,
      playerKey: 'player2',
      statKey,
    }),
  );

  // Resolve at step (if not skipped)
  if (!context.skipResolveStep) {
    steps.push(buildResolveAtStep({ allowedValues: EITHER_OR_ALLOWED_RESOLVE_AT }));
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
