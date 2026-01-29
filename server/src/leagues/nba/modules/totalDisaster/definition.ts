import type { ModeContext, LeagueModeModule } from '../../../types';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { prepareNbaTotalDisasterConfig } from './prepareConfig';
import { nbaTotalDisasterValidator } from './validator';
import { buildNbaTotalDisasterUserConfig } from './userConfig';
import { nbaTotalDisasterOverview } from './overview';
import { getNbaTotalDisasterLiveInfo } from './liveInfo';
import {
  NBA_TOTAL_DISASTER_LABEL,
  NBA_TOTAL_DISASTER_MODE_KEY,
  LINE_MIN,
  LINE_MAX,
  LINE_STEP,
} from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe mode functions
// ─────────────────────────────────────────────────────────────────────────────

function computeWinningCondition({ config }: ModeContext): string {
  const home = config.home_team_name || config.home_team_id || 'Home Team';
  const away = config.away_team_name || config.away_team_id || 'Away Team';
  const line = config.line_label || config.line || 'line';
  const resolveAt = typeof config.resolve_at === 'string' ? config.resolve_at : null;
  const timing = resolveAt === 'Halftime' ? ' by halftime' : '';
  return `Total points between ${home} and ${away} over/under ${line}${timing}`;
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
    if (raw < LINE_MIN || raw > LINE_MAX) {
      errors.push(`Line must be between ${LINE_MIN} and ${LINE_MAX}`);
    }
    if (Math.abs(Math.round(raw * 2)) % 2 !== 1) {
      errors.push('Line must end in .5');
    }
  }
  return errors;
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  errors.push(...validateLine(config));
  if (!config.resolve_at) {
    errors.push('Resolve at required');
  }
  return errors;
}

// Step validators
function validateLineStep({ config }: ModeContext): string[] {
  return validateLine(config);
}

function validateResolveAt({ config }: ModeContext): string[] {
  return config.resolve_at ? [] : ['Resolve at required'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module definition
// ─────────────────────────────────────────────────────────────────────────────

export const nbaTotalDisasterModule: LeagueModeModule = {
  key: NBA_TOTAL_DISASTER_MODE_KEY,
  label: NBA_TOTAL_DISASTER_LABEL,
  supportedLeagues: ['NBA'],
  definition: {
    key: NBA_TOTAL_DISASTER_MODE_KEY,
    label: NBA_TOTAL_DISASTER_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [
      {
        key: 'line',
        component: 'totalDisaster.line',
        label: 'Select Over/Under Line',
        props: {
          lineRange: {
            min: LINE_MIN,
            max: LINE_MAX,
            step: LINE_STEP,
          },
        },
        validate: validateLineStep,
      },
      {
        key: 'resolve_at',
        component: 'shared.resolveAt',
        label: 'Resolve At',
        props: {
          allowedResolveAt: ALLOWED_RESOLVE_AT,
          defaultResolveAt: DEFAULT_RESOLVE_AT,
        },
        validate: validateResolveAt,
      },
    ],
    metadata: {
      lineRange: {
        min: LINE_MIN,
        max: LINE_MAX,
        step: LINE_STEP,
        unit: 'points',
      },
      allowedResolveAt: ALLOWED_RESOLVE_AT,
      defaultResolveAt: DEFAULT_RESOLVE_AT,
    },
  },
  overview: nbaTotalDisasterOverview,
  prepareConfig: async ({ bet, config, league }) => prepareNbaTotalDisasterConfig({ bet, config, league }),
  validator: nbaTotalDisasterValidator,
  buildUserConfig: buildNbaTotalDisasterUserConfig,
  getLiveInfo: getNbaTotalDisasterLiveInfo,
};
