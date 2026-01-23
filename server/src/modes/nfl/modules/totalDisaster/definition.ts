import type { ModeContext, LeagueModeModule } from '../../../types';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../shared/statConstants';
import { prepareTotalDisasterConfig } from './prepareConfig';
import { totalDisasterValidator } from './validator';
import { buildTotalDisasterUserConfig } from './userConfig';
import { totalDisasterOverview } from './overview';
import { getTotalDisasterLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe mode functions
// ─────────────────────────────────────────────────────────────────────────────

function computeWinningCondition({ config }: ModeContext): string {
  const home = config.home_team_name || config.home_team_id || 'Home Team';
  const away = config.away_team_name || config.away_team_id || 'Away Team';
  const line = config.line_label || config.line || 'line';
  return `Total points between ${home} and ${away} over/under ${line}`;
}

function computeOptions(): string[] {
  return ['pass', 'Over', 'Under'];
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

export const totalDisasterModule: LeagueModeModule = {
  key: 'total_disaster',
  label: 'Total Disaster',
  supportedLeagues: ['NFL'],
  definition: {
    key: 'total_disaster',
    label: 'Total Disaster',
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
            min: 0.5,
            max: 199.5,
            step: 1,
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
        min: 0.5,
        max: 199.5,
        step: 1,
        unit: 'points',
      },
      allowedResolveAt: ALLOWED_RESOLVE_AT,
      defaultResolveAt: DEFAULT_RESOLVE_AT,
    },
  },
  overview: totalDisasterOverview,
  prepareConfig: async ({ bet, config }) => prepareTotalDisasterConfig({ bet, config }),
  validator: totalDisasterValidator,
  buildUserConfig: buildTotalDisasterUserConfig,
  getLiveInfo: getTotalDisasterLiveInfo,
};
