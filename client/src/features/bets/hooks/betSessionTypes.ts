import type { League } from '@shared/types/bet';
import type {
  BetConfigSession,
  BetGeneralConfigSchema,
  BetModePreview,
} from '../service';

// ── Public form values ────────────────────────────────────────────────
export type BetProposalFormValues = {
  config_session_id?: string;
  league_game_id?: string;
  league?: League;
  mode_key?: string;
  mode_config?: Record<string, unknown>;
  wager_amount?: number;
  time_limit_seconds?: number;
  preview?: BetModePreview | null;
  // U2Pick-specific
  u2pick_winning_condition?: string;
  u2pick_options?: string[];
};

// ── Stage / wizard types ──────────────────────────────────────────────
export type ConfigSessionStage =
  | 'league'
  | 'start'
  | 'mode'
  | 'general'
  | 'summary'
  | 'u2pick_condition'
  | 'u2pick_options';

export const STAGE_ORDER: Record<ConfigSessionStage, number> = {
  league: 0,
  start: 1,
  u2pick_condition: 1.5,
  u2pick_options: 1.6,
  mode: 2,
  general: 3,
  summary: 4,
};

// ── Mode entry (from bootstrap) ──────────────────────────────────────
export type ModeEntry = {
  key: string;
  label: string;
  available?: boolean;
  supportedLeagues?: League[];
};

// ── U2Pick validation ────────────────────────────────────────────────
export type U2PickValidation = {
  conditionMin: number;
  conditionMax: number;
  optionMin: number;
  optionMax: number;
  optionsMinCount: number;
  optionsMaxCount: number;
};

export const DEFAULT_U2PICK_VALIDATION: U2PickValidation = {
  conditionMin: 1,
  conditionMax: 999,
  optionMin: 1,
  optionMax: 999,
  optionsMinCount: 2,
  optionsMaxCount: 99,
};

export const DEFAULT_GENERAL_VALUES = {
  wager_amount: '0.25',
  time_limit_seconds: '30',
} as const;

export type GeneralValues = {
  wager_amount: string;
  time_limit_seconds: string;
};

// ── Aggregate session state ──────────────────────────────────────────
export interface BetSessionState {
  // Stage
  stage: ConfigSessionStage;
  manualStageOverride: boolean;
  modeStepIndex: number;

  // Bootstrap data
  activeLeagues: League[];
  games: { id: string; label: string }[];
  gamesLoading: boolean;
  modes: ModeEntry[];
  generalSchema: BetGeneralConfigSchema | null;
  bootstrapLoading: boolean;
  bootstrapError: string | null;

  // Selection
  league: League;
  gameId: string;
  modeKey: string;

  // Server config session
  session: BetConfigSession | null;
  sessionLoading: boolean;
  sessionUpdating: boolean;
  sessionError: string | null;

  // General config
  generalValues: GeneralValues;
  generalSaving: boolean;
  generalError: string | null;

  // U2Pick
  u2pickCondition: string;
  u2pickOptions: string[];
  u2pickValidation: U2PickValidation;
}

// ── Actions ──────────────────────────────────────────────────────────
export type BetSessionAction =
  // Stage navigation
  | { type: 'SET_STAGE'; stage: ConfigSessionStage }
  | { type: 'SET_MANUAL_OVERRIDE'; override: boolean }
  | { type: 'SET_MODE_STEP_INDEX'; index: number }

  // Bootstrap
  | { type: 'BOOTSTRAP_START' }
  | {
      type: 'BOOTSTRAP_SUCCESS';
      modes: ModeEntry[];
      generalSchema: BetGeneralConfigSchema | null;
      games: { id: string; label: string }[];
      activeLeagues: League[];
      u2pickValidation?: U2PickValidation;
      defaultGameId?: string;
      defaultModeKey?: string;
      defaultGeneralValues?: GeneralValues;
    }
  | { type: 'BOOTSTRAP_ERROR'; error: string }
  | { type: 'SET_ACTIVE_LEAGUES'; leagues: League[] }
  | { type: 'SET_GAMES'; games: { id: string; label: string }[] }
  | { type: 'SET_GAMES_LOADING'; loading: boolean }

  // Selection
  | { type: 'SET_LEAGUE'; league: League }
  | { type: 'SET_GAME_ID'; gameId: string }
  | { type: 'SET_MODE_KEY'; modeKey: string }

  // Server session
  | { type: 'SESSION_START' }
  | { type: 'SESSION_CREATED'; session: BetConfigSession }
  | { type: 'SESSION_ERROR'; error: string }
  | { type: 'SESSION_UPDATE_START' }
  | { type: 'SESSION_UPDATED'; session: BetConfigSession }
  | { type: 'SESSION_UPDATE_ERROR'; error: string }
  | { type: 'RESET_SESSION' }

  // General config
  | { type: 'SET_GENERAL_VALUES'; values: GeneralValues }
  | { type: 'GENERAL_SAVE_START' }
  | { type: 'GENERAL_SAVE_SUCCESS'; session: BetConfigSession }
  | { type: 'GENERAL_SAVE_ERROR'; error: string }

  // U2Pick
  | { type: 'SET_U2PICK_CONDITION'; condition: string }
  | { type: 'SET_U2PICK_OPTIONS'; options: string[] }
  | { type: 'SET_U2PICK_VALIDATION'; validation: U2PickValidation };

// ── Helpers ──────────────────────────────────────────────────────────
export function computeModeAvailability(
  mode: ModeEntry | null | undefined,
  league: League,
): boolean {
  if (!mode) return false;
  if (Array.isArray(mode.supportedLeagues) && mode.supportedLeagues.length) {
    return mode.supportedLeagues.includes(league);
  }
  return mode.available !== false;
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length) return error;
  return fallback;
}

export function mapStatusToStage(
  status: 'mode_config' | 'general' | 'summary',
): ConfigSessionStage {
  if (status === 'summary') return 'summary';
  if (status === 'general') return 'general';
  return 'mode';
}
