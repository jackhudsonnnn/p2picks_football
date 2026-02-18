/**
 * Spread The Wealth Mode Factory
 *
 * Creates a Spread The Wealth module for any supported league.
 * Reduces code duplication across NFL/NBA implementations.
 */

import type { League } from '../../../types/league';
import type {
  LeagueModeModule,
  ModeContext,
  ModeOverview,
  ModeValidator,
  ModeUserConfigStep,
  ModeConfigStepDefinition,
  BuildUserConfigInput,
  GetLiveInfoInput,
  ModeLiveInfo,
} from '../../../types/modes';
import type { BetProposal } from '../../../supabaseClient';
import { normalizeSpread } from '../../sharedUtils/spreadEvaluator';

// ─────────────────────────────────────────────────────────────────────────────
// Factory configuration type
// ─────────────────────────────────────────────────────────────────────────────

export interface SpreadTheWealthConfig {
  /** The league (e.g., 'NFL', 'NBA') */
  league: League;
  /** Mode key, e.g., 'nfl_spread_the_wealth' */
  modeKey: string;
  /** Human-readable label */
  modeLabel: string;
  /** Spread value range */
  spreadRange: {
    min: number;
    max: number;
    step: number;
  };
  /** Optional allowed resolve_at values */
  allowedResolveAt?: readonly string[];
  /** Optional default resolve_at value */
  defaultResolveAt?: string;
  /** Whether resolve_at step is required */
  requiresResolveAt: boolean;
}

export interface SpreadTheWealthHandlers {
  /** Returns mode overview */
  overview: ModeOverview;
  /** Validates a bet proposal */
  validator: ModeValidator;
  /** Builds user config */
  buildUserConfig: (input: BuildUserConfigInput) => Promise<ModeUserConfigStep[]>;
  /** Gets live info */
  getLiveInfo: (input: GetLiveInfoInput) => Promise<ModeLiveInfo>;
  /** Prepares config before saving */
  prepareConfig: (params: {
    bet: BetProposal;
    config: Record<string, unknown>;
    league: League;
  }) => Promise<Record<string, unknown>>;
  /** Build metadata for the mode (optional) */
  buildMetadata?: () => Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createSpreadTheWealthModule(
  cfg: SpreadTheWealthConfig,
  handlers: SpreadTheWealthHandlers,
): LeagueModeModule {
  // ───────────────────────────────────────────────────────────────────────────
  // Shared mode logic
  // ───────────────────────────────────────────────────────────────────────────

  function computeWinningCondition({ config }: ModeContext): string {
    const home = config.home_team_name || config.home_team_id || 'Home Team';
    const away = config.away_team_name || config.away_team_id || 'Away Team';
    const spread = config.spread_label || config.spread || 'adjusted';
    const resolveAtRaw =
      (typeof config.resolve_at === 'string' && config.resolve_at.trim()) ||
      cfg.defaultResolveAt ||
      'End of Game';
    const resolveAt = resolveAtRaw === 'Halftime' ? 'at halftime' : 'by end of game';
    return `Highest score ${resolveAt} between ${home} (${spread} points) and ${away}`;
  }

  function computeOptions({ config }: ModeContext): string[] {
    const spread = normalizeSpread(config as Record<string, unknown>);
    const allowsTie = spread != null && Number.isInteger(spread);
    const home = config.home_team_name || config.home_team_id || 'Home Team';
    const away = config.away_team_name || config.away_team_id || 'Away Team';
    if (allowsTie) {
      return ['No Entry', String(home), String(away), 'Tie'];
    }
    return ['No Entry', String(home), String(away)];
  }

  function validateSpread(config: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const raw = Number(config.spread_value ?? config.spread ?? NaN);
    if (!config.spread && config.spread !== 0 && config.spread_value == null) {
      errors.push('Spread required');
    }
    if (!Number.isFinite(raw)) {
      errors.push('Spread must be numeric');
    } else {
      if (raw < cfg.spreadRange.min || raw > cfg.spreadRange.max) {
        errors.push(`Spread must be between ${cfg.spreadRange.min} and ${cfg.spreadRange.max}`);
      }
      const step = cfg.spreadRange.step;
      if (Math.abs(raw / step - Math.round(raw / step)) > 1e-9) {
        errors.push(`Spread must be in ${step} increments`);
      }
    }
    return errors;
  }

  function validateConfig({ config }: ModeContext): string[] {
    const errors: string[] = [];
    errors.push(...validateSpread(config));
    const resolveAtRaw = typeof config.resolve_at === 'string' ? config.resolve_at.trim() : '';
    if (cfg.requiresResolveAt && !resolveAtRaw) {
      errors.push('Resolve at required');
    }
    if (resolveAtRaw && cfg.allowedResolveAt && !cfg.allowedResolveAt.includes(resolveAtRaw)) {
      errors.push(`Resolve at must be one of: ${cfg.allowedResolveAt.join(', ')}`);
    }
    return errors;
  }

  // Step validators
  function validateSpreadStep({ config }: ModeContext): string[] {
    return validateSpread(config);
  }

  function validateResolveAt({ config }: ModeContext): string[] {
    return config.resolve_at ? [] : ['Resolve at required'];
  }

  // Build config steps
  const configSteps: ModeConfigStepDefinition[] = [
    {
      key: 'spread',
      component: 'spreadTheWealth.spread',
      label: 'Select Point Spread',
      props: {
        min: cfg.spreadRange.min,
        max: cfg.spreadRange.max,
        step: cfg.spreadRange.step,
      },
      validate: validateSpreadStep,
    },
  ];

  if (cfg.requiresResolveAt && cfg.allowedResolveAt) {
    configSteps.push({
      key: 'resolve_at',
      component: 'shared.resolveAt',
      label: 'Resolve At',
      props: {
        allowedResolveAt: cfg.allowedResolveAt,
        defaultResolveAt: cfg.defaultResolveAt,
      },
      validate: validateResolveAt,
    });
  } else {
    // NBA uses a simpler resolve step
    configSteps.push({
      key: 'resolve_at',
      component: 'spreadTheWealth.resolve',
      label: 'Resolve At',
    });
  }

  // Build metadata
  const metadata = handlers.buildMetadata
    ? handlers.buildMetadata()
    : {
        spreadRange: {
          min: cfg.spreadRange.min,
          max: cfg.spreadRange.max,
          step: cfg.spreadRange.step,
          unit: 'points',
        },
        ...(cfg.allowedResolveAt ? { allowedResolveAt: cfg.allowedResolveAt } : {}),
        ...(cfg.defaultResolveAt ? { defaultResolveAt: cfg.defaultResolveAt } : {}),
      };

  // ───────────────────────────────────────────────────────────────────────────
  // Module definition
  // ───────────────────────────────────────────────────────────────────────────

  return {
    key: cfg.modeKey,
    label: cfg.modeLabel,
    supportedLeagues: [cfg.league],
    definition: {
      key: cfg.modeKey,
      label: cfg.modeLabel,
      computeWinningCondition,
      computeOptions,
      validateConfig,
      configSteps,
      metadata,
    },
    overview: handlers.overview,
    prepareConfig: async ({ bet, config }) =>
      handlers.prepareConfig({ bet, config, league: cfg.league }),
    validator: handlers.validator,
    buildUserConfig: handlers.buildUserConfig,
    getLiveInfo: handlers.getLiveInfo,
  };
}
