/**
 * Score Sorcerer Mode Factory
 *
 * Creates a Score Sorcerer module for any supported league.
 * Reduces code duplication across NFL/NBA implementations.
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
// Factory configuration type
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreSorcererConfig {
  /** The league (e.g., 'NFL', 'NBA') */
  league: League;
  /** Mode key, e.g., 'nfl_score_sorcerer' */
  modeKey: string;
  /** Human-readable label */
  modeLabel: string;
  /** Label for "No More Scores" option */
  noMoreScoresLabel: string;
  /** Baseline event name for real-time subscriptions */
  baselineEvent: string;
  /** Result event name for real-time subscriptions */
  resultEvent: string;
}

export interface ScoreSorcererHandlers {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createScoreSorcererModule(
  cfg: ScoreSorcererConfig,
  handlers: ScoreSorcererHandlers,
): LeagueModeModule {
  // ───────────────────────────────────────────────────────────────────────────
  // Shared mode logic
  // ───────────────────────────────────────────────────────────────────────────

  function computeWinningCondition(): string {
    return 'Next team to score';
  }

  function computeOptions({ config }: ModeContext): string[] {
    const home =
      config.home_team_name || config.home_team_abbrev || config.home_team_id || 'Home Team';
    const away =
      config.away_team_name || config.away_team_abbrev || config.away_team_id || 'Away Team';
    return ['No Entry', String(home), String(away), cfg.noMoreScoresLabel];
  }

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
      configSteps: [],
      metadata: {
        baselineEvent: cfg.baselineEvent,
        resultEvent: cfg.resultEvent,
      },
    },
    overview: handlers.overview,
    prepareConfig: async ({ bet, config }) =>
      handlers.prepareConfig({ bet, config, league: cfg.league }),
    validator: handlers.validator,
    buildUserConfig: handlers.buildUserConfig,
    getLiveInfo: handlers.getLiveInfo,
  };
}
