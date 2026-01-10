import type { ModeContext, ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AT, STAT_KEY_TO_CATEGORY, STAT_KEY_LABELS } from './constants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';
import { eitherOrOverview } from './overview';
import { getEitherOrLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe mode functions
// ─────────────────────────────────────────────────────────────────────────────

function computeWinningCondition({ config }: ModeContext): string {
  const player1 = config.player1_name || config.player1_id || 'Player 1';
  const player2 = config.player2_name || config.player2_id || 'Player 2';
  const progressDesc = config.progress_mode === 'cumulative' ? '— total' : '— net gain in';
  const stat = config.stat_label || config.stat || 'stat';
  const resolveAt = config.resolve_at || 'the selected time';
  return `${player1} vs ${player2} ${progressDesc} ${stat} until ${resolveAt}`;
}

function computeOptions({ config }: ModeContext): string[] {
  const opts: string[] = ['pass'];
  const player1 = config.player1_name || config.player1_id;
  const player2 = config.player2_name || config.player2_id;
  if (player1) opts.push(String(player1));
  if (player2) opts.push(String(player2));
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

function validateResolveAt({ config }: ModeContext): string[] {
  return config.resolve_at ? [] : ['Resolve at required'];
}

function validateProgressMode({ config }: ModeContext): string[] {
  return config.progress_mode ? [] : ['Progress tracking selection required'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module definition
// ─────────────────────────────────────────────────────────────────────────────

export const eitherOrModule: ModeModule = {
  definition: {
    key: 'either_or',
    label: 'Either Or',
    summaryTemplate: 'Either Or',
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
          statKeyLabels: STAT_KEY_LABELS,
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
        props: {
          allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
        },
        validate: validateResolveAt,
      },
      {
        key: 'progress_mode',
        component: 'eitherOr.progressMode',
        label: 'Track Progress',
        description: 'Determine whether to compare cumulative stats or gains after betting closes.',
        validate: validateProgressMode,
      },
    ],
    metadata: buildEitherOrMetadata(),
  },
  overview: eitherOrOverview,
  prepareConfig: prepareEitherOrConfig,
  validator: eitherOrValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
    buildEitherOrUserConfig({ nflGameId, existingConfig: config ?? {} }),
  getLiveInfo: getEitherOrLiveInfo,
};
