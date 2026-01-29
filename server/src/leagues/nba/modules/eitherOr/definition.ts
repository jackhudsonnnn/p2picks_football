import type { ModeContext, LeagueModeModule } from '../../../types';
import { ALLOWED_RESOLVE_AT, NBA_STAT_KEY_LABELS as NBA_STAT_LABELS, NBA_STAT_KEY_TO_CATEGORY as STAT_KEY_TO_CATEGORY } from '../../utils/statConstants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';
import { eitherOrOverview } from './overview';
import { getEitherOrLiveInfo } from './liveInfo';
import { NBA_EITHER_OR_MODE_KEY, NBA_EITHER_OR_LABEL } from './constants';

function computeWinningCondition({ config }: ModeContext): string {
  const player1 = config.player1_name || config.player1_id || 'Player 1';
  const player2 = config.player2_name || config.player2_id || 'Player 2';
  const progressDesc = config.progress_mode === 'cumulative' ? '— total' : '— net gain in';
  const stat = config.stat_label || config.stat || 'stat';
  const resolveAt = config.resolve_at || 'the selected time';
  return `${player1} vs ${player2} ${progressDesc} ${stat} until ${resolveAt}`;
}

function computeOptions({ config }: ModeContext): string[] {
  const opts: string[] = ['No Entry'];
  const player1 = config.player1_name || config.player1_id;
  const player2 = config.player2_name || config.player2_id;
  if (player1) opts.push(String(player1));
  if (player2) opts.push(String(player2));
  return opts;
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  if (!config.player1_id || !config.player2_id) errors.push('Two players required');
  if (!config.stat) errors.push('Stat required');
  if (!config.progress_mode) errors.push('Progress tracking selection required');
  return errors;
}

const validateStat = ({ config }: ModeContext) => (config.stat ? [] : ['Stat required']);
const validatePlayer1 = ({ config }: ModeContext) => (config.player1_id ? [] : ['Player 1 required']);
const validatePlayer2 = ({ config }: ModeContext) => {
  const errs: string[] = [];
  if (!config.player2_id) errs.push('Player 2 required');
  if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) {
    errs.push('Players must differ');
  }
  return errs;
};
const validateResolveAt = ({ config }: ModeContext) => (config.resolve_at ? [] : ['Resolve at required']);
const validateProgressMode = ({ config }: ModeContext) => (config.progress_mode ? [] : ['Progress tracking selection required']);

export const nbaEitherOrModule: LeagueModeModule = {
  key: NBA_EITHER_OR_MODE_KEY,
  label: NBA_EITHER_OR_LABEL,
  supportedLeagues: ['NBA'],
  definition: {
    key: NBA_EITHER_OR_MODE_KEY,
    label: NBA_EITHER_OR_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [
      {
        key: 'stat',
        component: 'eitherOr.stat',
        label: 'Select Stat',
        props: {
          statKeyToCategory: STAT_KEY_TO_CATEGORY,
          statKeyLabels: NBA_STAT_LABELS,
          allowedStatKeys: Object.keys(STAT_KEY_TO_CATEGORY),
        },
        validate: validateStat,
      },
      {
        key: 'player1',
        component: 'eitherOr.player1',
        label: 'Select Player 1',
        validate: validatePlayer1,
      },
      {
        key: 'player2',
        component: 'eitherOr.player2',
        label: 'Select Player 2',
        validate: validatePlayer2,
      },
      {
        key: 'resolve_at',
        component: 'eitherOr.resolve',
        label: 'Resolve At',
        props: { allowedResolveAt: ALLOWED_RESOLVE_AT },
        validate: validateResolveAt,
      },
      {
        key: 'progress_mode',
        component: 'eitherOr.progressMode',
        label: 'Track Progress',
        description: 'Choose whether to compare cumulative stats or gains after betting closes.',
        validate: validateProgressMode,
      },
    ],
    metadata: buildEitherOrMetadata(),
  },
  overview: eitherOrOverview,
  prepareConfig: async ({ bet, config }) => prepareEitherOrConfig({ bet, config }),
  validator: eitherOrValidator,
  buildUserConfig: buildEitherOrUserConfig,
  getLiveInfo: getEitherOrLiveInfo,
};
