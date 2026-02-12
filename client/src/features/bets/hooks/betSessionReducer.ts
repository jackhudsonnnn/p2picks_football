import type {
  BetSessionState,
  BetSessionAction,
  GeneralValues,
} from './betSessionTypes';
import {
  DEFAULT_U2PICK_VALIDATION,
  DEFAULT_GENERAL_VALUES,
} from './betSessionTypes';

export const INITIAL_STATE: BetSessionState = {
  stage: 'league',
  manualStageOverride: false,
  modeStepIndex: 0,

  activeLeagues: [],
  games: [],
  gamesLoading: false,
  modes: [],
  generalSchema: null,
  bootstrapLoading: false,
  bootstrapError: null,

  league: 'U2Pick',
  gameId: '',
  modeKey: '',

  session: null,
  sessionLoading: false,
  sessionUpdating: false,
  sessionError: null,

  generalValues: { ...DEFAULT_GENERAL_VALUES },
  generalSaving: false,
  generalError: null,

  u2pickCondition: '',
  u2pickOptions: ['', ''],
  u2pickValidation: { ...DEFAULT_U2PICK_VALIDATION },
};

export function betSessionReducer(
  state: BetSessionState,
  action: BetSessionAction,
): BetSessionState {
  switch (action.type) {
    // ── Stage ──────────────────────────────────────────────────────────
    case 'SET_STAGE':
      return { ...state, stage: action.stage };
    case 'SET_MANUAL_OVERRIDE':
      return { ...state, manualStageOverride: action.override };
    case 'SET_MODE_STEP_INDEX':
      return { ...state, modeStepIndex: action.index };

    // ── Bootstrap ─────────────────────────────────────────────────────
    case 'BOOTSTRAP_START':
      return { ...state, bootstrapLoading: true, bootstrapError: null };
    case 'BOOTSTRAP_SUCCESS': {
      const updates: Partial<BetSessionState> = {
        bootstrapLoading: false,
        modes: action.modes,
        generalSchema: action.generalSchema,
        games: action.games,
        activeLeagues: action.activeLeagues,
      };
      if (action.u2pickValidation) updates.u2pickValidation = action.u2pickValidation;
      if (action.defaultGeneralValues) updates.generalValues = action.defaultGeneralValues;
      if (action.defaultGameId !== undefined) {
        updates.gameId = state.gameId || action.defaultGameId;
      }
      if (action.defaultModeKey !== undefined) {
        updates.modeKey = state.modeKey || action.defaultModeKey;
      }
      return { ...state, ...updates };
    }
    case 'BOOTSTRAP_ERROR':
      return { ...state, bootstrapLoading: false, bootstrapError: action.error };
    case 'SET_ACTIVE_LEAGUES':
      return { ...state, activeLeagues: action.leagues };
    case 'SET_GAMES':
      return { ...state, games: action.games };
    case 'SET_GAMES_LOADING':
      return { ...state, gamesLoading: action.loading };

    // ── Selection ─────────────────────────────────────────────────────
    case 'SET_LEAGUE':
      return { ...state, league: action.league, games: [] };
    case 'SET_GAME_ID':
      return { ...state, gameId: action.gameId };
    case 'SET_MODE_KEY':
      return { ...state, modeKey: action.modeKey };

    // ── Server session ────────────────────────────────────────────────
    case 'SESSION_START':
      return {
        ...state,
        sessionLoading: true,
        sessionError: null,
        manualStageOverride: false,
      };
    case 'SESSION_CREATED':
      return {
        ...state,
        session: action.session,
        sessionLoading: false,
        stage: 'mode',
      };
    case 'SESSION_ERROR':
      return {
        ...state,
        sessionLoading: false,
        sessionError: action.error,
      };
    case 'SESSION_UPDATE_START':
      return {
        ...state,
        sessionUpdating: true,
        sessionError: null,
        manualStageOverride: false,
      };
    case 'SESSION_UPDATED':
      return {
        ...state,
        session: action.session,
        sessionUpdating: false,
      };
    case 'SESSION_UPDATE_ERROR':
      return {
        ...state,
        sessionUpdating: false,
        sessionError: action.error,
      };
    case 'RESET_SESSION': {
      const schema = state.generalSchema;
      return {
        ...state,
        session: null,
        sessionError: null,
        generalError: null,
        manualStageOverride: false,
        modeStepIndex: 0,
        generalValues: schema
          ? {
              wager_amount: String(schema.wager_amount.defaultValue),
              time_limit_seconds: String(schema.time_limit_seconds.defaultValue),
            }
          : state.generalValues,
      };
    }

    // ── General config ────────────────────────────────────────────────
    case 'SET_GENERAL_VALUES':
      return { ...state, generalValues: action.values };
    case 'GENERAL_SAVE_START':
      return {
        ...state,
        generalSaving: true,
        generalError: null,
        manualStageOverride: false,
      };
    case 'GENERAL_SAVE_SUCCESS':
      return {
        ...state,
        session: action.session,
        generalSaving: false,
      };
    case 'GENERAL_SAVE_ERROR':
      return { ...state, generalSaving: false, generalError: action.error };

    // ── U2Pick ────────────────────────────────────────────────────────
    case 'SET_U2PICK_CONDITION':
      return { ...state, u2pickCondition: action.condition };
    case 'SET_U2PICK_OPTIONS':
      return { ...state, u2pickOptions: action.options };
    case 'SET_U2PICK_VALIDATION':
      return { ...state, u2pickValidation: action.validation };

    default:
      return state;
  }
}

/** Derive generalValues from a new session snapshot. */
export function syncGeneralFromSession(
  session: { general: { wager_amount: number; time_limit_seconds: number } } | null,
): GeneralValues | null {
  if (!session) return null;
  return {
    wager_amount: String(session.general.wager_amount),
    time_limit_seconds: String(session.general.time_limit_seconds),
  };
}
