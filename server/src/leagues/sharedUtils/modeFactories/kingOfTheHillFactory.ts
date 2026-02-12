/**
 * King of the Hill Mode Factory
 *
 * Creates league-specific King of the Hill mode modules from configuration.
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

export interface KingOfTheHillFactoryConfig {
  /** Target league for this module */
  league: League;
  /** Unique mode key */
  modeKey: string;
  /** Human-readable label */
  modeLabel: string;
  /** Stat key to category mapping */
  statKeyToCategory: Record<string, string>;
  /** Stat key to label mapping */
  statKeyLabels: Record<string, string>;
  /** Allowed resolve values */
  allowedResolveValues: readonly number[];
  /** Default resolve value */
  defaultResolveValue: number;
}

export interface KingOfTheHillFactoryHandlers {
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
  /** Build metadata for the mode */
  buildMetadata: () => Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a league-specific King of the Hill mode module.
 */
export function createKingOfTheHillModule(
  config: KingOfTheHillFactoryConfig,
  handlers: KingOfTheHillFactoryHandlers,
): LeagueModeModule {
  const {
    league,
    modeKey,
    modeLabel,
    statKeyToCategory,
    statKeyLabels,
    allowedResolveValues,
    defaultResolveValue,
  } = config;

  // Shared mode logic
  function computeWinningCondition({ config: cfg }: ModeContext): string {
    const player1 = cfg.player1_name || cfg.player1_id || 'Player 1';
    const player2 = cfg.player2_name || cfg.player2_id || 'Player 2';
    const progressDesc = cfg.progress_mode === 'cumulative' ? 'first to hit' : 'first to add';
    const resolveValue = cfg.resolve_value_label || cfg.resolve_value || defaultResolveValue;
    const stat = cfg.stat_label || cfg.stat || 'stat';
    return `${player1} vs ${player2} — ${progressDesc} ${resolveValue} ${stat}`;
  }

  function computeOptions({ config: cfg }: ModeContext): string[] {
    const opts: string[] = ['No Entry'];
    const player1 = cfg.player1_name || cfg.player1_id;
    const player2 = cfg.player2_name || cfg.player2_id;
    if (player1) opts.push(String(player1));
    if (player2) opts.push(String(player2));
    if (!opts.includes('Neither')) opts.push('Neither');
    return opts;
  }

  function validateConfig({ config: cfg }: ModeContext): string[] {
    const errors: string[] = [];
    if (!cfg.player1_id || !cfg.player2_id) {
      errors.push('Two players required');
    }
    if (!cfg.stat) {
      errors.push('Stat required');
    }
    if (!cfg.progress_mode) {
      errors.push('Progress tracking selection required');
    }
    const value = Number(cfg.resolve_value ?? cfg.resolve_value_label);
    if (!Number.isFinite(value)) {
      errors.push('Resolve value required');
    }
    return errors;
  }

  // Step validators
  const validateStat = ({ config: cfg }: ModeContext) => (cfg.stat ? [] : ['Stat required']);
  const validatePlayer1 = ({ config: cfg }: ModeContext) => (cfg.player1_id ? [] : ['Player 1 required']);
  const validatePlayer2 = ({ config: cfg }: ModeContext) => {
    const errors: string[] = [];
    if (!cfg.player2_id) errors.push('Player 2 required');
    if (cfg.player1_id && cfg.player2_id && String(cfg.player1_id) === String(cfg.player2_id)) {
      errors.push('Players must differ');
    }
    return errors;
  };
  const validateResolveValue = ({ config: cfg }: ModeContext) => {
    const errors: string[] = [];
    const value = Number(cfg.resolve_value ?? cfg.resolve_value_label);
    if (!Number.isFinite(value)) {
      errors.push('Resolve value required');
    } else if (value < allowedResolveValues[0] || value > allowedResolveValues[allowedResolveValues.length - 1]) {
      errors.push('Resolve value out of range');
    }
    return errors;
  };
  const validateProgressMode = ({ config: cfg }: ModeContext) =>
    cfg.progress_mode ? [] : ['Progress tracking selection required'];

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
          component: 'kingOfTheHill.stat',
          label: 'Select Stat',
          props: {
            statKeyToCategory,
            statKeyLabels,
            allowedStatKeys: Object.keys(statKeyToCategory),
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
          label: 'Target Value',
          props: {
            allowedResolveValues,
            defaultResolveValue,
          },
          validate: validateResolveValue,
        },
        {
          key: 'progress_mode',
          component: 'kingOfTheHill.progressMode',
          label: 'Track Progress',
          description: 'Choose whether to compare cumulative stats or gains after betting closes.',
          validate: validateProgressMode,
        },
      ],
      metadata: handlers.buildMetadata(),
    },
    overview: handlers.overview,
    prepareConfig: async ({ bet, config: modeConfig }) =>
      handlers.prepareConfig({ bet, config: modeConfig, league }),
    validator: handlers.validator,
    buildUserConfig: handlers.buildUserConfig,
    getLiveInfo: handlers.getLiveInfo,
  };
}
