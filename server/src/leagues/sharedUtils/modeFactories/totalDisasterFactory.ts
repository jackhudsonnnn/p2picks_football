/**
 * Total Disaster Mode Factory
 *
 * Creates league-specific Total Disaster mode modules from configuration.
 * This eliminates code duplication between NFL and NBA implementations.
 */

import type { League } from '../../../types/league';
import type {
  LeagueModeModule,
  ModeContext,
  ModeOverview,
  ModeValidator,
  ModeUserConfigStep,
  BuildUserConfigInput,
  GetLiveInfoInput,
  ModeLiveInfo,
} from '../../../types/modes';
import type { BetProposal } from '../../../supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Factory Configuration Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TotalDisasterFactoryConfig {
  /** Target league for this module */
  league: League;
  /** Unique mode key */
  modeKey: string;
  /** Human-readable label */
  modeLabel: string;
  /** Allowed resolve at values */
  allowedResolveAt: readonly string[];
  /** Default resolve at value */
  defaultResolveAt: string;
  /** Line validation bounds */
  lineValidation: {
    min: number;
    max: number;
    step: number;
  };
}

export interface TotalDisasterFactoryHandlers {
  /** Overview for the mode */
  overview: ModeOverview;
  /** Validator instance */
  validator: ModeValidator;
  /** Build user config steps */
  buildUserConfig: (input: BuildUserConfigInput) => Promise<ModeUserConfigStep[]>;
  /** Get live info for display */
  getLiveInfo: (input: GetLiveInfoInput) => Promise<ModeLiveInfo>;
  /** Prepare config before bet creation */
  prepareConfig: (input: {
    bet: BetProposal;
    config: Record<string, unknown>;
    league: League;
  }) => Promise<Record<string, unknown>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Mode Logic (league-agnostic)
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

function createLineValidator(min: number, max: number) {
  return function validateLine(config: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const raw = Number(config.line_value ?? config.line ?? NaN);
    if (!config.line && config.line !== 0 && config.line_value == null) {
      errors.push('Line required');
    }
    if (!Number.isFinite(raw)) {
      errors.push('Line must be numeric');
    } else {
      if (raw < min || raw > max) {
        errors.push(`Line must be between ${min} and ${max}`);
      }
      if (Math.abs(Math.round(raw * 2)) % 2 !== 1) {
        errors.push('Line must end in .5');
      }
    }
    return errors;
  };
}

function createConfigValidator(lineValidator: (config: Record<string, unknown>) => string[]) {
  return function validateConfig({ config }: ModeContext): string[] {
    const errors: string[] = [];
    errors.push(...lineValidator(config));
    if (!config.resolve_at) {
      errors.push('Resolve at required');
    }
    return errors;
  };
}

function validateResolveAt({ config }: ModeContext): string[] {
  return config.resolve_at ? [] : ['Resolve at required'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a league-specific Total Disaster mode module.
 */
export function createTotalDisasterModule(
  config: TotalDisasterFactoryConfig,
  handlers: TotalDisasterFactoryHandlers,
): LeagueModeModule {
  const { league, modeKey, modeLabel, allowedResolveAt, defaultResolveAt, lineValidation } = config;

  const validateLine = createLineValidator(lineValidation.min, lineValidation.max);
  const validateConfig = createConfigValidator(validateLine);
  const validateLineStep = ({ config: cfg }: ModeContext) => validateLine(cfg);

  return {
    key: modeKey,
    label: modeLabel,
    supportedLeagues: [league],
    definition: {
      key: modeKey,
      label: modeLabel,
      computeWinningCondition,
      computeOptions,
      validateConfig,
      configSteps: [
        {
          key: 'line',
          component: 'totalDisaster.line',
          label: 'Set Line',
          description: 'Choose the over/under line for total points.',
          props: {
            min: lineValidation.min,
            max: lineValidation.max,
            step: lineValidation.step,
          },
          validate: validateLineStep,
        },
        {
          key: 'resolve_at',
          component: 'totalDisaster.resolve',
          label: 'Resolve At',
          description: 'When should the bet resolve?',
          props: {
            allowedResolveAt,
            defaultResolveAt,
          },
          validate: validateResolveAt,
        },
      ],
    },
    overview: handlers.overview,
    prepareConfig: async ({ bet, config: modeConfig }) =>
      handlers.prepareConfig({ bet, config: modeConfig, league }),
    validator: handlers.validator,
    buildUserConfig: handlers.buildUserConfig,
    getLiveInfo: handlers.getLiveInfo,
  };
}
