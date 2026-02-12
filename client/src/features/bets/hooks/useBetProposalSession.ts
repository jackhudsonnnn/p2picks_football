import { type SetStateAction, useCallback, useEffect, useMemo, useReducer } from 'react';
import type { League } from '@shared/types/bet';
import type { BetModeUserConfigStep } from '../service';
import {
  type BetProposalFormValues,
  STAGE_ORDER,
  computeModeAvailability,
  mapStatusToStage,
} from './betSessionTypes';
import { betSessionReducer, INITIAL_STATE, syncGeneralFromSession } from './betSessionReducer';
import { useBootstrapData } from './useBootstrapData';
import { useModeConfig } from './useModeConfig';
import { useGeneralConfig } from './useGeneralConfig';

export type { BetProposalFormValues };

export function useBetProposalSession(onSubmit: (values: BetProposalFormValues) => void) {
  const [state, dispatch] = useReducer(betSessionReducer, INITIAL_STATE);

  // ── Sub-hooks for data fetching / server calls ─────────────────────
  useBootstrapData(state, dispatch);
  const { initializeSession, handleChoiceChange } = useModeConfig(state, dispatch);
  const { handleGeneralSubmit } = useGeneralConfig(state, dispatch);

  // ── Destructure for readability ────────────────────────────────────
  const {
    stage,
    manualStageOverride,
    modeStepIndex,
    league,
    gameId,
    modeKey,
    session,
    modes,
    generalSchema,
    activeLeagues,
    u2pickCondition,
    u2pickOptions,
    u2pickValidation,
    generalValues,
    bootstrapLoading,
    bootstrapError,
    gamesLoading,
    sessionLoading,
    sessionUpdating,
    sessionError,
    generalSaving,
    generalError,
    games,
  } = state;

  // ── Stage sync with session status ─────────────────────────────────
  useEffect(() => {
    if (!session || manualStageOverride) return;
    const derivedStage = mapStatusToStage(session.status);
    const noModeSteps = (session.steps?.length ?? 0) === 0;
    if (noModeSteps) {
      if (stage !== derivedStage) dispatch({ type: 'SET_STAGE', stage: derivedStage });
      return;
    }
    if (stage === 'mode' && STAGE_ORDER[derivedStage] > STAGE_ORDER[stage]) return;
    if (STAGE_ORDER[derivedStage] > STAGE_ORDER[stage]) {
      dispatch({ type: 'SET_STAGE', stage: derivedStage });
    }
  }, [session, stage, manualStageOverride]);

  // ── Sync general values from session ───────────────────────────────
  useEffect(() => {
    if (!session) {
      if (stage !== 'league' && stage !== 'start') {
        dispatch({ type: 'SET_STAGE', stage: 'start' });
      }
      return;
    }
    const synced = syncGeneralFromSession(session);
    if (synced) dispatch({ type: 'SET_GENERAL_VALUES', values: synced });
  }, [session?.general.wager_amount, session?.general.time_limit_seconds]);

  // ── Clear session when selection changes ───────────────────────────
  useEffect(() => {
    if (!session) return;
    if (!gameId || !modeKey) {
      dispatch({ type: 'RESET_SESSION' });
      return;
    }
    if (session.mode_key !== modeKey || session.league_game_id !== gameId || session.league !== league) {
      dispatch({ type: 'RESET_SESSION' });
    }
  }, [gameId, league, modeKey, session]);

  // ── U2Pick defaults on league change ───────────────────────────────
  useEffect(() => {
    if (league === 'U2Pick') {
      dispatch({ type: 'SET_GAMES', games: [] });
    }
  }, [league]);

  // ── Clear unavailable mode selection ───────────────────────────────
  useEffect(() => {
    if (!modeKey) return;
    const selectedMode = modes.find((m) => m.key === modeKey);
    if (!computeModeAvailability(selectedMode, league)) {
      dispatch({ type: 'SET_MODE_KEY', modeKey: '' });
    }
  }, [league, modeKey, modes]);

  // ── Clamp step index ───────────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      if (modeStepIndex !== 0) dispatch({ type: 'SET_MODE_STEP_INDEX', index: 0 });
      return;
    }
    const lastIndex = Math.max(session.steps.length - 1, 0);
    if (modeStepIndex > lastIndex) dispatch({ type: 'SET_MODE_STEP_INDEX', index: lastIndex });
  }, [session?.steps.length, modeStepIndex]);

  // ── Reset step index on new session ────────────────────────────────
  useEffect(() => {
    if (!session) return;
    dispatch({ type: 'SET_MODE_STEP_INDEX', index: 0 });
  }, [session?.session_id]);

  // ── Navigation: Back ───────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (stage === 'league') return;
    if (stage === 'start') {
      dispatch({ type: 'SET_STAGE', stage: 'league' });
      return;
    }
    dispatch({ type: 'SET_MANUAL_OVERRIDE', override: true });

    if (stage === 'u2pick_condition') {
      dispatch({ type: 'SET_STAGE', stage: 'league' });
      return;
    }
    if (stage === 'u2pick_options') {
      dispatch({ type: 'SET_STAGE', stage: 'u2pick_condition' });
      return;
    }
    if (stage === 'mode') {
      if (modeStepIndex > 0) {
        dispatch({ type: 'SET_MODE_STEP_INDEX', index: modeStepIndex - 1 });
      } else {
        dispatch({ type: 'RESET_SESSION' });
      }
    } else if (stage === 'general') {
      if (league === 'U2Pick') {
        dispatch({ type: 'SET_STAGE', stage: 'u2pick_options' });
      } else if (session?.steps.length) {
        dispatch({ type: 'SET_MODE_STEP_INDEX', index: session.steps.length - 1 });
        dispatch({ type: 'SET_STAGE', stage: 'mode' });
      } else {
        dispatch({ type: 'SET_STAGE', stage: 'start' });
      }
    } else if (stage === 'summary') {
      dispatch({ type: 'SET_STAGE', stage: 'general' });
    }
  }, [stage, modeStepIndex, session?.steps.length, league]);

  // ── Navigation: Next ───────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (stage === 'league') {
      if (!activeLeagues.includes(league)) return;
      dispatch({ type: 'SET_STAGE', stage: league === 'U2Pick' ? 'u2pick_condition' : 'start' });
      return;
    }
    if (stage === 'u2pick_condition') {
      const trimmed = u2pickCondition.trim();
      if (trimmed.length < u2pickValidation.conditionMin || trimmed.length > u2pickValidation.conditionMax) return;
      dispatch({ type: 'SET_STAGE', stage: 'u2pick_options' });
      return;
    }
    if (stage === 'u2pick_options') {
      const valid = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= u2pickValidation.optionMin && o.length <= u2pickValidation.optionMax);
      if (valid.length < u2pickValidation.optionsMinCount) return;
      dispatch({ type: 'SET_STAGE', stage: 'general' });
      return;
    }
    if (stage === 'start') {
      if (!computeModeAvailability(modes.find((m) => m.key === modeKey), league)) return;
      void initializeSession();
      return;
    }
    if (stage === 'mode') {
      if (!session) return;
      if (!session.steps.length) {
        dispatch({ type: 'SET_MANUAL_OVERRIDE', override: false });
        dispatch({ type: 'SET_STAGE', stage: 'general' });
        return;
      }
      const lastIndex = session.steps.length - 1;
      if (modeStepIndex < lastIndex) {
        dispatch({ type: 'SET_MODE_STEP_INDEX', index: modeStepIndex + 1 });
        return;
      }
      if (session.status !== 'mode_config') {
        dispatch({ type: 'SET_MANUAL_OVERRIDE', override: false });
        dispatch({ type: 'SET_STAGE', stage: 'general' });
      }
      return;
    }
    if (stage === 'general') {
      if (league === 'U2Pick') {
        dispatch({ type: 'SET_STAGE', stage: 'summary' });
        return;
      }
      void handleGeneralSubmit();
    }
  }, [stage, league, activeLeagues, u2pickCondition, u2pickOptions, u2pickValidation, modes, modeKey, initializeSession, session, modeStepIndex, handleGeneralSubmit]);

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (league === 'U2Pick') {
      const trimmed = u2pickCondition.trim();
      const valid = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= u2pickValidation.optionMin && o.length <= u2pickValidation.optionMax);
      if (trimmed.length < u2pickValidation.conditionMin || valid.length < u2pickValidation.optionsMinCount) return;
      onSubmit({
        league: 'U2Pick',
        mode_key: 'u2pick',
        wager_amount: Number(generalValues.wager_amount),
        time_limit_seconds: Number(generalValues.time_limit_seconds),
        u2pick_winning_condition: trimmed,
        u2pick_options: valid,
        preview: { summary: trimmed, description: trimmed, options: valid, winningCondition: trimmed },
      });
      return;
    }
    if (!session || session.status !== 'summary' || !session.preview) return;
    if (session.preview.errors && session.preview.errors.length) return;
    onSubmit({
      config_session_id: session.session_id,
      league_game_id: session.league_game_id,
      league: session.league,
      mode_key: session.mode_key,
      wager_amount: session.general.wager_amount,
      time_limit_seconds: session.general.time_limit_seconds,
      preview: session.preview,
    });
  }, [session, onSubmit, league, u2pickCondition, u2pickOptions, u2pickValidation, generalValues]);

  // ── Derived values ─────────────────────────────────────────────────
  const effectiveGeneralSchema = session?.general_schema || generalSchema;

  const activeModeStep: BetModeUserConfigStep | null = useMemo(() => {
    if (!session || !session.steps.length) return null;
    const idx = Math.min(Math.max(modeStepIndex, 0), session.steps.length - 1);
    return session.steps[idx];
  }, [session, modeStepIndex]);

  const hasModeSteps = Boolean(session && session.steps.length > 0);

  const selectedMode = useMemo(() => modes.find((m) => m.key === modeKey) || null, [modes, modeKey]);
  const selectedModeAvailable = useMemo(
    () => computeModeAvailability(selectedMode, league),
    [selectedMode, league],
  );

  const canProceed = useMemo(() => {
    if (stage === 'league') return Boolean(activeLeagues.includes(league) && !sessionLoading);
    if (stage === 'u2pick_condition') {
      const t = u2pickCondition.trim();
      return t.length >= u2pickValidation.conditionMin && t.length <= u2pickValidation.conditionMax;
    }
    if (stage === 'u2pick_options') {
      const v = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= u2pickValidation.optionMin && o.length <= u2pickValidation.optionMax);
      return v.length >= u2pickValidation.optionsMinCount;
    }
    if (stage === 'start') return Boolean(gameId && modeKey && league && !sessionLoading && selectedModeAvailable);
    if (stage === 'mode') {
      if (!session || sessionUpdating) return false;
      if (!hasModeSteps) return true;
      return Boolean(activeModeStep && activeModeStep.selectedChoiceId);
    }
    if (stage === 'general') return league === 'U2Pick' ? !generalSaving : Boolean(session && !generalSaving);
    return false;
  }, [stage, gameId, modeKey, league, activeLeagues, sessionLoading, session, sessionUpdating, generalSaving, hasModeSteps, activeModeStep, selectedModeAvailable, u2pickCondition, u2pickOptions, u2pickValidation]);

  const canSubmit = useMemo(() => {
    if (league === 'U2Pick' && stage === 'summary') {
      const t = u2pickCondition.trim();
      const v = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= u2pickValidation.optionMin && o.length <= u2pickValidation.optionMax);
      return t.length >= u2pickValidation.conditionMin && v.length >= u2pickValidation.optionsMinCount && !generalSaving;
    }
    if (!session || session.status !== 'summary' || !session.preview) return false;
    return (session.preview.errors?.length ?? 0) === 0 && !generalSaving && !sessionUpdating;
  }, [session, generalSaving, sessionUpdating, league, stage, u2pickCondition, u2pickOptions, u2pickValidation]);

  const disableBack = stage === 'league' || sessionLoading;
  const disableNext = stage === 'summary' || !canProceed || sessionLoading || sessionUpdating || generalSaving;

  // ── Wrapped setters ────────────────────────────────────────────────
  const setLeague = useCallback((l: League) => dispatch({ type: 'SET_LEAGUE', league: l }), [dispatch]);
  const setGameId = useCallback((id: string) => dispatch({ type: 'SET_GAME_ID', gameId: id }), [dispatch]);
  const setModeKey = useCallback((k: string) => dispatch({ type: 'SET_MODE_KEY', modeKey: k }), [dispatch]);
  const setGeneralValues = useCallback(
    (v: SetStateAction<{ wager_amount: string; time_limit_seconds: string }>) => {
      const resolved = typeof v === 'function' ? v(state.generalValues) : v;
      dispatch({ type: 'SET_GENERAL_VALUES', values: resolved });
    },
    [state.generalValues],
  );
  const setU2pickCondition = useCallback((c: string) => dispatch({ type: 'SET_U2PICK_CONDITION', condition: c }), [dispatch]);
  const setU2pickOptions = useCallback(
    (o: SetStateAction<string[]>) => {
      const resolved = typeof o === 'function' ? o(state.u2pickOptions) : o;
      dispatch({ type: 'SET_U2PICK_OPTIONS', options: resolved });
    },
    [state.u2pickOptions],
  );

  return {
    // data
    games,
    modes,
    generalSchema,
    effectiveGeneralSchema,
    generalValues,
    setGeneralValues,
    session,
    activeModeStep,
    hasModeSteps,

    // selection
    gameId,
    setGameId,
    league,
    setLeague,
    activeLeagues,
    modeKey,
    setModeKey,

    // U2Pick state
    u2pickCondition,
    setU2pickCondition,
    u2pickOptions,
    setU2pickOptions,
    u2pickValidation,

    // availability
    selectedModeAvailable,
    isModeAvailable: (key: string, currentLeague: League = league) =>
      computeModeAvailability(modes.find((m) => m.key === key), currentLeague),

    // flags
    stage,
    bootstrapLoading,
    bootstrapError,
    gamesLoading,
    sessionLoading,
    sessionUpdating,
    sessionError,
    generalSaving,
    generalError,

    // navigation helpers
    canProceed,
    canSubmit,
    disableBack,
    disableNext,
    handleBack,
    handleNext,
    handleChoiceChange,
    handleSubmit,
  } as const;
}
