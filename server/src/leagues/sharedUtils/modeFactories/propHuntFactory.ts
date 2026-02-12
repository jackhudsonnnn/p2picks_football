/**
 * Prop Hunt Mode Factory
 *
 * Creates league-specific Prop Hunt mode modules from configuration.
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

export interface PropHuntFactoryConfig {
  /** Target league for this module */
  league: League;
  /** Unique mode key */
  modeKey: string;
  /** Human-readable label */
  modeLabel: string;
  /** Stat key to label mapping */
  statKeyLabels: Record<string, string>;
  /** Stat key to category mapping (optional) */
  statKeyToCategory?: Record<string, string>;
  /** Allowed resolve at values */
  allowedResolveAt: readonly string[];
  /** Default resolve at value */
  defaultResolveAt: string;
  /** Line validation bounds */
  lineRange: {
    min: number;
    max: number;
    step: number;
  };
}

export interface PropHuntFactoryHandlers {
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
    if (!config.player_id && !config.player_name) {
      errors.push('Player required');
    }
    if (!config.stat) {
      errors.push('Stat required');
    }
    if (!config.progress_mode) {
      errors.push('Progress tracking selection required');
    }
    errors.push(...lineValidator(config));
    if (!config.resolve_at) {
      errors.push('Resolve at required');
    }
    return errors;
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a league-specific Prop Hunt mode module.
 */
export function createPropHuntModule(
  config: PropHuntFactoryConfig,
  handlers: PropHuntFactoryHandlers,
): LeagueModeModule {
  const {
    league,
    modeKey,
    modeLabel,
    statKeyLabels,
    statKeyToCategory,
    allowedResolveAt,
    defaultResolveAt,
    lineRange,
  } = config;

  const validateLine = createLineValidator(lineRange.min, lineRange.max);
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
          key: 'stat',
          component: 'propHunt.stat',
          label: 'Select Stat',
          props: {
            statKeyLabels,
            ...(statKeyToCategory ? { statKeyToCategory } : {}),
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
            allowedResolveAt,
            defaultResolveAt,
          },
          validate: validateResolveAt,
        },
        {
          key: 'progress_mode',
          component: 'propHunt.progressMode',
          label: 'Track Progress',
          description: 'Decide whether to capture a Starting Now baseline or use full-game totals before setting the line.',
          validate: validateProgressMode,
        },
        {
          key: 'line',
          component: 'propHunt.line',
          label: 'Set Line',
          props: {
            lineRange,
          },
          validate: validateLineStep,
        },
      ],
      metadata: {
        allowedResolveAt,
        defaultResolveAt,
        statKeyLabels,
        lineRange,
        progressModes: ['starting_now', 'cumulative'],
      },
    },
    overview: handlers.overview,
    prepareConfig: async ({ bet, config: modeConfig }) =>
      handlers.prepareConfig({ bet, config: modeConfig, league }),
    validator: handlers.validator,
    buildUserConfig: handlers.buildUserConfig,
    getLiveInfo: handlers.getLiveInfo,
  };
}
