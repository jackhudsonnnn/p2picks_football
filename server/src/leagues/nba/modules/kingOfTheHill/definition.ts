import type { ModeContext, LeagueModeModule } from '../../../types';
import {
  NBA_KOTH_ALLOWED_RESOLVE_VALUES,
  NBA_KOTH_DEFAULT_RESOLVE_VALUE,
  NBA_KOTH_LABEL,
  NBA_KOTH_MODE_KEY,
  NBA_KOTH_STAT_KEY_LABELS,
  NBA_KOTH_STAT_KEY_TO_CATEGORY,
} from './constants';
import { buildKingOfTheHillMetadata, prepareKingOfTheHillConfig } from './prepareConfig';
import { kingOfTheHillValidator } from './validator';
import { buildKingOfTheHillUserConfig } from './userConfig';
import { kingOfTheHillOverview } from './overview';
import { getKingOfTheHillLiveInfo } from './liveInfo';

function computeWinningCondition({ config }: ModeContext): string {
  const player1 = config.player1_name || config.player1_id || 'Player 1';
  const player2 = config.player2_name || config.player2_id || 'Player 2';
  const progressDesc = config.progress_mode === 'cumulative' ? 'first to hit' : 'first to add';
  const resolveValue = config.resolve_value_label || config.resolve_value || NBA_KOTH_DEFAULT_RESOLVE_VALUE;
  const stat = config.stat_label || config.stat || 'stat';
  return `${player1} vs ${player2} — ${progressDesc} ${resolveValue} ${stat}`;
}

function computeOptions({ config }: ModeContext): string[] {
  const opts: string[] = ['No Entry'];
  const player1 = config.player1_name || config.player1_id;
  const player2 = config.player2_name || config.player2_id;
  if (player1) opts.push(String(player1));
  if (player2) opts.push(String(player2));
  if (!opts.includes('Neither')) opts.push('Neither');
  return opts;
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  if (!config.player1_id || !config.player2_id) errors.push('Two players required');
  if (!config.stat) errors.push('Stat required');
  if (!config.progress_mode) errors.push('Progress tracking selection required');
  const value = Number(config.resolve_value ?? config.resolve_value_label);
  if (!Number.isFinite(value)) errors.push('Resolve value required');
  return errors;
}

const validateStat = ({ config }: ModeContext) => (config.stat ? [] : ['Stat required']);
const validatePlayer1 = ({ config }: ModeContext) => (config.player1_id ? [] : ['Player 1 required']);
const validatePlayer2 = ({ config }: ModeContext) => {
  const errors: string[] = [];
  if (!config.player2_id) errors.push('Player 2 required');
  if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) {
    errors.push('Players must differ');
  }
  return errors;
};
const validateResolveValue = ({ config }: ModeContext) => {
  const errors: string[] = [];
  const value = Number(config.resolve_value ?? config.resolve_value_label);
  if (!Number.isFinite(value)) errors.push('Resolve value required');
  else if (value < NBA_KOTH_ALLOWED_RESOLVE_VALUES[0] || value > NBA_KOTH_ALLOWED_RESOLVE_VALUES.at(-1)!) {
    errors.push('Resolve value out of range');
  }
  return errors;
};
const validateProgressMode = ({ config }: ModeContext) => (config.progress_mode ? [] : ['Progress tracking selection required']);

export const kingOfTheHillModule: LeagueModeModule = {
  key: NBA_KOTH_MODE_KEY,
  label: NBA_KOTH_LABEL,
  supportedLeagues: ['NBA'],
  definition: {
    key: NBA_KOTH_MODE_KEY,
    label: NBA_KOTH_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [
      {
        key: 'stat',
        component: 'kingOfTheHill.stat',
        label: 'Select Stat',
        props: {
          statKeyToCategory: NBA_KOTH_STAT_KEY_TO_CATEGORY,
          statKeyLabels: NBA_KOTH_STAT_KEY_LABELS,
          allowedStatKeys: Object.keys(NBA_KOTH_STAT_KEY_TO_CATEGORY),
        },
        validate: validateStat,
      },
      {
        key: 'player1',
        component: 'kingOfTheHill.player1',
        label: 'Select Player 1',
        validate: validatePlayer1,
      },
      {
        key: 'player2',
        component: 'kingOfTheHill.player2',
        label: 'Select Player 2',
        validate: validatePlayer2,
      },
      {
        key: 'progress_mode',
        component: 'kingOfTheHill.progressMode',
        label: 'Track Progress',
        validate: validateProgressMode,
      },
      {
        key: 'resolve_value',
        component: 'kingOfTheHill.resolveValue',
        label: 'Resolve Value',
        props: {
          allowedValues: NBA_KOTH_ALLOWED_RESOLVE_VALUES,
          defaultValue: NBA_KOTH_DEFAULT_RESOLVE_VALUE,
        },
        validate: validateResolveValue,
      },
    ],
    metadata: buildKingOfTheHillMetadata(),
  },
  overview: kingOfTheHillOverview,
  prepareConfig: async ({ bet, config }) => prepareKingOfTheHillConfig({ bet, config }),
  validator: kingOfTheHillValidator,
  buildUserConfig: buildKingOfTheHillUserConfig,
  getLiveInfo: getKingOfTheHillLiveInfo,
};
