import { getAllPlayers, getGameStatus } from '../../../services/leagueData';
import type { LeaguePlayer } from '../../../services/leagueData/types';
import type { League } from '../../../types/league';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../types';

interface GameContext {
  players: LeaguePlayer[];
  status: string | null;
  showProgressStep: boolean;
}

export async function loadGameContext(league: League, gameId: string | null | undefined): Promise<GameContext> {
  if (!gameId) {
    return { players: [], status: null, showProgressStep: false };
  }

  const players = await getAllPlayers(league, gameId);
  const status = await getGameStatus(league, gameId);
  const showProgressStep = Boolean(status && status !== 'STATUS_SCHEDULED');

  return { players, status, showProgressStep };
}

export function getDefaultProgressPatch(showProgressStep: boolean): Record<string, unknown> {
  return showProgressStep ? {} : { progress_mode: 'starting_now' };
}

interface ProgressModeOptions {
  showProgressStep: boolean;
  startingNowDescription?: string;
  cumulativeDescription?: string;
  clearsOnChange?: string[];
  clearStepsOnChange?: string[];
}

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
        options.cumulativeDescription ?? 'Use full-game totals and compare at the resolve time.',
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