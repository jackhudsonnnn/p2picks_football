/**
 * Either/Or Mode Factory
 *
 * Creates league-specific Either/Or mode modules from configuration.
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

export interface EitherOrFactoryConfig {
  /** Target league for this module */
  league: League;
  /** Unique mode key (e.g., 'either_or', 'nba_either_or') */
  modeKey: string;
  /** Human-readable label */
  modeLabel: string;
  /** Stat key to category mapping */
  statKeyToCategory: Record<string, string>;
  /** Stat key to label mapping */
  statKeyLabels: Record<string, string>;
  /** Allowed resolve at values */
  allowedResolveAt: readonly string[];
}

export interface EitherOrFactoryHandlers {
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
  }) => Promise<Record<string, unknown>>;
  /** Build metadata for the mode */
  buildMetadata: () => Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Mode Logic (league-agnostic)
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
  const opts: string[] = ['No Entry'];
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
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a league-specific Either/Or mode module.
 *
 * @example
 * ```typescript
 * export const eitherOrModule = createEitherOrModule(
 *   {
 *     league: 'NFL',
 *     modeKey: 'either_or',
 *     modeLabel: 'Either/Or',
 *     statKeyToCategory: NFL_STAT_KEY_TO_CATEGORY,
 *     statKeyLabels: NFL_STAT_KEY_LABELS,
 *     allowedResolveAt: ALLOWED_RESOLVE_AT,
 *   },
 *   {
 *     overview: eitherOrOverview,
 *     validator: eitherOrValidator,
 *     buildUserConfig,
 *     getLiveInfo,
 *     prepareConfig,
 *     buildMetadata,
 *   }
 * );
 * ```
 */
export function createEitherOrModule(
  config: EitherOrFactoryConfig,
  handlers: EitherOrFactoryHandlers,
): LeagueModeModule {
  const { league, modeKey, modeLabel, statKeyToCategory, statKeyLabels, allowedResolveAt } = config;

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
          component: 'eitherOr.stat',
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
            allowedResolveAt,
          },
          validate: validateResolveAt,
        },
        {
          key: 'progress_mode',
          component: 'eitherOr.progressMode',
          label: 'Track Progress',
          description: 'Choose whether to compare cumulative stats or gains after betting closes.',
          validate: validateProgressMode,
        },
      ],
      metadata: handlers.buildMetadata(),
    },
    overview: handlers.overview,
    prepareConfig: async ({ bet, config: modeConfig }) =>
      handlers.prepareConfig({ bet, config: modeConfig }),
    validator: handlers.validator,
    buildUserConfig: handlers.buildUserConfig,
    getLiveInfo: handlers.getLiveInfo,
  };
}
