import type { ModeContext, LeagueModeModule } from '../../../types';
import {
  KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
  KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
  KING_OF_THE_HILL_MODE_KEY,
  KING_OF_THE_HILL_LABEL,
} from './constants';
import { buildKingOfTheHillMetadata, prepareKingOfTheHillConfig } from './prepareConfig';
import { kingOfTheHillValidator } from './validator';
import { buildKingOfTheHillUserConfig } from './userConfig';
import { kingOfTheHillOverview } from './overview';
import { getKingOfTheHillLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe mode functions
// ─────────────────────────────────────────────────────────────────────────────

function computeWinningCondition({ config }: ModeContext): string {
  const player1 = config.player1_name || config.player1_id || 'Player 1';
  const player2 = config.player2_name || config.player2_id || 'Player 2';
  const progressDesc = config.progress_mode === 'cumulative' ? 'first to hit' : 'first to add';
  const resolveValue = config.resolve_value_label || config.resolve_value || KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE;
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
  if (!config.player1_id || !config.player2_id) {
    errors.push('Two players required');
  }
  if (!config.stat) {
    errors.push('Stat required');
  }
  if (!config.progress_mode) {
    errors.push('Progress tracking selection required');
  }
  const value = Number(config.resolve_value ?? config.resolve_value_label);
  if (!Number.isFinite(value)) {
    errors.push('Resolve value required');
  }
  return errors;
}

// Step validators
function validateStat({ config }: ModeContext): string[] {
  return config.stat ? [] : ['Stat required'];
}

function validatePlayer1({ config }: ModeContext): string[] {
  return config.player1_id ? [] : ['Player 1 required'];
}

function validatePlayer2({ config }: ModeContext): string[] {
  const errors: string[] = [];
  if (!config.player2_id) {
    errors.push('Player 2 required');
  }
  if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) {
    errors.push('Players must differ');
  }
  return errors;
}

function validateResolveValue({ config }: ModeContext): string[] {
  const errors: string[] = [];
  const value = Number(config.resolve_value ?? config.resolve_value_label);
  if (!Number.isFinite(value)) {
    errors.push('Resolve value required');
  } else if (value < 1 || value > 499) {
    errors.push('Resolve value must be between 1 and 499');
  }
  return errors;
}

function validateProgressMode({ config }: ModeContext): string[] {
  return config.progress_mode ? [] : ['Progress tracking selection required'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module definition
// ─────────────────────────────────────────────────────────────────────────────

export const kingOfTheHillModule: LeagueModeModule = {
  key: KING_OF_THE_HILL_MODE_KEY,
  label: KING_OF_THE_HILL_LABEL,
  supportedLeagues: ['NFL'],
  definition: {
    key: KING_OF_THE_HILL_MODE_KEY,
    label: KING_OF_THE_HILL_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [
      {
        key: 'stat',
        component: 'kingOfTheHill.stat',
        label: 'Select Stat',
        props: {
          statKeyToCategory: KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
          statKeyLabels: KING_OF_THE_HILL_STAT_KEY_LABELS,
          allowedStatKeys: Object.keys(KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY),
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
        key: 'resolve_value',
        component: 'kingOfTheHill.resolveValue',
        label: 'Resolve Value',
        props: {
          allowedValues: KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
          defaultValue: KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
        },
        validate: validateResolveValue,
      },
      {
        key: 'progress_mode',
        component: 'kingOfTheHill.progressMode',
        label: 'Track Progress',
        validate: validateProgressMode,
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
