import type { ModeContext, LeagueModeModule } from '../../../types';
import { nbaPropHuntOverview } from './overview';
import { buildNbaPropHuntUserConfig } from './userConfig';
import { prepareNbaPropHuntConfig } from './prepareConfig';
import { nbaPropHuntValidator } from './validator';
import { getNbaPropHuntLiveInfo } from './liveInfo';
import {
  NBA_PROP_HUNT_ALLOWED_RESOLVE_AT,
  NBA_PROP_HUNT_DEFAULT_RESOLVE_AT,
  NBA_PROP_HUNT_LINE_RANGE,
  NBA_PROP_HUNT_MODE_KEY,
  NBA_PROP_HUNT_LABEL,
  NBA_PROP_HUNT_STAT_KEY_LABELS,
  NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY,
} from './constants';

function computeWinningCondition({ config }: ModeContext): string {
  const player = config.player_name || config.player_id || 'the player';
  const line = config.line_label || config.line || 'the line';
  const stat = config.stat_label || config.stat || 'stat';
  const progressDesc = config.progress_mode === 'cumulative' ? '' : 'now';
  const resolveAt = config.resolve_at || 'settle time';
  return `${player} over/under ${line} ${stat} ${progressDesc} until ${resolveAt}`.replace(/\s+/g, ' ').trim();
}

function computeOptions(): string[] {
  return ['No Entry', 'Over', 'Under'];
}

function validateLine(config: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const raw = Number(config.line_value ?? config.line ?? NaN);
  if (!config.line && config.line !== 0 && config.line_value == null) {
    errors.push('Line required');
  }
  if (!Number.isFinite(raw)) {
    errors.push('Line must be numeric');
  } else {
    if (raw < 0.5 || raw > 199.5) {
      errors.push('Line must be between 0.5 and 199.5');
    }
    if (Math.abs(Math.round(raw * 2)) % 2 !== 1) {
      errors.push('Line must end in .5');
    }
  }
  return errors;
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  if (!config.player_id && !config.player_name) {
    errors.push('Player required');
  }
  if (!config.stat) {
    errors.push('Stat required');
  }
  if (!config.progress_mode) {
    errors.push('Progress tracking selection required');
  }
  errors.push(...validateLine(config));
  if (!config.resolve_at) {
    errors.push('Resolve at required');
  }
  return errors;
}

function validateStat({ config }: ModeContext): string[] {
  return config.stat ? [] : ['Stat required'];
}
function validatePlayer({ config }: ModeContext): string[] {
  return config.player_id || config.player_name ? [] : ['Player required'];
}
function validateResolveAt({ config }: ModeContext): string[] {
  return config.resolve_at ? [] : ['Resolve at required'];
}
function validateProgressMode({ config }: ModeContext): string[] {
  return config.progress_mode ? [] : ['Progress tracking selection required'];
}
function validateLineStep({ config }: ModeContext): string[] {
  return validateLine(config);
}

export const nbaPropHuntModule: LeagueModeModule = {
  key: NBA_PROP_HUNT_MODE_KEY,
  label: NBA_PROP_HUNT_LABEL,
  supportedLeagues: ['NBA'],
  definition: {
    key: NBA_PROP_HUNT_MODE_KEY,
    label: NBA_PROP_HUNT_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [
      {
        key: 'stat',
        component: 'propHunt.stat',
        label: 'Select Stat',
        props: {
          statKeyLabels: NBA_PROP_HUNT_STAT_KEY_LABELS,
          statKeyToCategory: NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY,
        },
        validate: validateStat,
      },
      {
        key: 'player',
        component: 'propHunt.player',
        label: 'Select Player',
        validate: validatePlayer,
      },
      {
        key: 'resolve_at',
        component: 'propHunt.resolveAt',
        label: 'Resolve At',
        props: {
          allowedResolveAt: NBA_PROP_HUNT_ALLOWED_RESOLVE_AT,
          defaultResolveAt: NBA_PROP_HUNT_DEFAULT_RESOLVE_AT,
        },
        validate: validateResolveAt,
      },
      {
        key: 'progress_mode',
        component: 'propHunt.progressMode',
        label: 'Track Progress',
        validate: validateProgressMode,
      },
      {
        key: 'line',
        component: 'propHunt.line',
        label: 'Set Line',
        props: {
          lineRange: NBA_PROP_HUNT_LINE_RANGE,
        },
        validate: validateLineStep,
      },
    ],
    metadata: {
      allowedResolveAt: NBA_PROP_HUNT_ALLOWED_RESOLVE_AT,
      defaultResolveAt: NBA_PROP_HUNT_DEFAULT_RESOLVE_AT,
      statKeyLabels: NBA_PROP_HUNT_STAT_KEY_LABELS,
      lineRange: NBA_PROP_HUNT_LINE_RANGE,
      progressModes: ['starting_now', 'cumulative'],
    },
  },
  overview: nbaPropHuntOverview,
  prepareConfig: async ({ bet, config, league }) => prepareNbaPropHuntConfig({ bet, config, league }),
  validator: nbaPropHuntValidator,
  buildUserConfig: buildNbaPropHuntUserConfig,
  getLiveInfo: getNbaPropHuntLiveInfo,
};
