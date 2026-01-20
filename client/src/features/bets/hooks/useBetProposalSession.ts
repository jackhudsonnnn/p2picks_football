import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyBetConfigChoice,
  createBetConfigSession,
  fetchBetProposalBootstrap,
  updateBetGeneralConfig,
  type BetConfigSession,
  type BetGeneralConfigSchema,
  type BetModePreview,
  type BetModeUserConfigStep,
} from '../service';
import type { League } from '../types';

export type BetProposalFormValues = {
  config_session_id?: string;
  league_game_id?: string;
  league?: League;
  mode_key?: string;
  mode_config?: Record<string, unknown>;
  wager_amount?: number;
  time_limit_seconds?: number;
  preview?: BetModePreview | null;
};

export type ConfigSessionStage = 'start' | 'mode' | 'general' | 'summary';

const STAGE_ORDER: Record<ConfigSessionStage, number> = {
  start: 0,
  mode: 1,
  general: 2,
  summary: 3,
};

const DEFAULT_GENERAL_VALUES = {
  wager_amount: '0.25',
  time_limit_seconds: '30',
};

export function useBetProposalSession(onSubmit: (values: BetProposalFormValues) => void) {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [games, setGames] = useState<{ id: string; label: string }[]>([]);
  const [modes, setModes] = useState<{ key: string; label: string }[]>([]);
  const [generalSchema, setGeneralSchema] = useState<BetGeneralConfigSchema | null>(null);

  const [gameId, setGameId] = useState('');
  const [league, setLeague] = useState<'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'U2Pick'>('U2Pick');
  const [modeKey, setModeKey] = useState('');

  const [stage, setStage] = useState<ConfigSessionStage>('start');
  const [manualStageOverride, setManualStageOverride] = useState(false);
  const [modeStepIndex, setModeStepIndex] = useState(0);

  const [session, setSession] = useState<BetConfigSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [generalValues, setGeneralValues] = useState(DEFAULT_GENERAL_VALUES);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Bootstrap fetch
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        setBootstrapLoading(true);
        setBootstrapError(null);
        const payload = await fetchBetProposalBootstrap(controller.signal);
        if (cancelled) return;
        const gameEntries = Array.isArray(payload?.games)
          ? payload.games
              .map((item: any) => ({
                id: String(item?.id ?? ''),
                label: String(item?.label ?? ''),
              }))
              .filter((entry) => entry.id && entry.label)
          : [];
        const modeEntries = Array.isArray(payload?.modes)
          ? payload.modes
              .map((item: any) => ({
                key: String(item?.key ?? ''),
                label: String(item?.label ?? item?.key ?? ''),
              }))
              .filter((entry) => entry.key && entry.label)
          : [];
        setGames(gameEntries);
        setModes(modeEntries);
        if (payload?.general_config_schema) {
          setGeneralSchema(payload.general_config_schema as BetGeneralConfigSchema);
          setGeneralValues({
            wager_amount: String(payload.general_config_schema?.wager_amount?.defaultValue ?? DEFAULT_GENERAL_VALUES.wager_amount),
            time_limit_seconds: String(payload.general_config_schema?.time_limit_seconds?.defaultValue ?? DEFAULT_GENERAL_VALUES.time_limit_seconds),
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setBootstrapError(err?.message || 'Unable to load bet proposal setup');
        }
      } finally {
        if (!cancelled) setBootstrapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // Stage synchronization with session status
  useEffect(() => {
    if (!session || manualStageOverride) return;
    const derivedStage = mapStatusToStage(session.status);
    const noModeSteps = (session.steps?.length ?? 0) === 0;
    if (noModeSteps) {
      if (stage !== derivedStage) setStage(derivedStage);
      return;
    }
    if (stage === 'mode' && STAGE_ORDER[derivedStage] > STAGE_ORDER[stage]) return;
    if (STAGE_ORDER[derivedStage] > STAGE_ORDER[stage]) setStage(derivedStage);
  }, [session, stage, manualStageOverride]);

  // Keep general values in sync with session
  useEffect(() => {
    if (!session) {
      if (stage !== 'start') setStage('start');
      return;
    }
    setGeneralValues({
      wager_amount: String(session.general.wager_amount),
      time_limit_seconds: String(session.general.time_limit_seconds),
    });
  }, [session?.general.wager_amount, session?.general.time_limit_seconds]);

  const resetSession = useCallback(() => {
    setSession(null);
    setSessionError(null);
    setGeneralError(null);
    setManualStageOverride(false);
    setGeneralValues((prev) => ({
      wager_amount: generalSchema ? String(generalSchema.wager_amount.defaultValue) : prev.wager_amount,
      time_limit_seconds: generalSchema ? String(generalSchema.time_limit_seconds.defaultValue) : prev.time_limit_seconds,
    }));
    setModeStepIndex(0);
  }, [generalSchema]);

  // Clear session when identifiers change
  useEffect(() => {
    if (!session) return;
    if (!gameId || !modeKey) {
      resetSession();
      return;
    }
    if (session.mode_key !== modeKey || session.league_game_id !== gameId || session.league !== league) {
      resetSession();
    }
  }, [gameId, league, modeKey, session, resetSession]);

  // Clamp step index
  useEffect(() => {
    if (!session) {
      setModeStepIndex(0);
      return;
    }
    setModeStepIndex((prev) => {
      const lastIndex = Math.max(session.steps.length - 1, 0);
      if (prev > lastIndex) return lastIndex;
      if (prev < 0) return 0;
      return prev;
    });
  }, [session?.steps.length]);

  // Reset step index on new session
  useEffect(() => {
    if (!session) return;
    setModeStepIndex(0);
  }, [session?.session_id]);

  const initializeSession = useCallback(async () => {
    if (!gameId || !modeKey) return;
    setSessionLoading(true);
    setSessionError(null);
    setManualStageOverride(false);
    try {
      const dto = await createBetConfigSession(modeKey, gameId, league);
      setSession(dto);
      setStage('mode');
    } catch (err) {
      setSessionError(extractErrorMessage(err, 'Unable to start configuration'));
    } finally {
      setSessionLoading(false);
    }
  }, [gameId, league, modeKey]);

  const handleChoiceChange = useCallback(
    async (stepKey: string, choiceId: string) => {
      if (!session || !choiceId || sessionUpdating) return;
      const current = session.steps.find((step) => step.key === stepKey);
      if (current?.selectedChoiceId === choiceId) return;
      setSessionUpdating(true);
      setSessionError(null);
      setManualStageOverride(false);
      try {
        const dto = await applyBetConfigChoice(session.session_id, stepKey, choiceId);
        setSession(dto);
      } catch (err) {
        setSessionError(extractErrorMessage(err, 'Unable to update selection'));
      } finally {
        setSessionUpdating(false);
      }
    },
    [session, sessionUpdating],
  );

  const handleGeneralSubmit = useCallback(async () => {
    if (!session) return;
    setGeneralSaving(true);
    setGeneralError(null);
    setManualStageOverride(false);
    try {
      const dto = await updateBetGeneralConfig(session.session_id, {
        wager_amount: Number(generalValues.wager_amount),
        time_limit_seconds: Number(generalValues.time_limit_seconds),
      });
      setSession(dto);
    } catch (err) {
      setGeneralError(extractErrorMessage(err, 'Unable to update wager or time limit'));
    } finally {
      setGeneralSaving(false);
    }
  }, [session, generalValues]);

  const handleBack = useCallback(() => {
    if (stage === 'start') return;
    setManualStageOverride(true);
    if (stage === 'mode') {
      if (modeStepIndex > 0) {
        setModeStepIndex((prev) => Math.max(prev - 1, 0));
      } else {
        resetSession();
      }
    } else if (stage === 'general') {
      if (session?.steps.length) {
        setModeStepIndex(session.steps.length - 1);
        setStage('mode');
      } else {
        // If there were no mode-specific steps, the previous logical stage is start
        setStage('start');
      }
    } else if (stage === 'summary') {
      setStage('general');
    }
  }, [stage, modeStepIndex, resetSession, session?.steps.length]);

  const handleNext = useCallback(() => {
    if (stage === 'start') {
      void initializeSession();
      return;
    }
    if (stage === 'mode') {
      if (!session) return;
      if (!session.steps.length) {
        setManualStageOverride(false);
        setStage('general');
        return;
      }
      const lastIndex = session.steps.length - 1;
      if (modeStepIndex < lastIndex) {
        setModeStepIndex((prev) => Math.min(prev + 1, lastIndex));
        return;
      }
      if (session.status !== 'mode_config') {
        setManualStageOverride(false);
        setStage('general');
      }
      return;
    }
    if (stage === 'general') {
      void handleGeneralSubmit();
    }
  }, [stage, initializeSession, session, modeStepIndex, handleGeneralSubmit]);

  const handleSubmit = useCallback(() => {
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
  }, [session, onSubmit]);

  const effectiveGeneralSchema = session?.general_schema || generalSchema;
  const activeModeStep: BetModeUserConfigStep | null = useMemo(() => {
    if (!session || !session.steps.length) return null;
    const clampedIndex = Math.min(Math.max(modeStepIndex, 0), session.steps.length - 1);
    return session.steps[clampedIndex];
  }, [session, modeStepIndex]);

  const hasModeSteps = Boolean(session && session.steps.length > 0);

  const canProceed = useMemo(() => {
    if (stage === 'start') {
      return Boolean(gameId && modeKey && league && !sessionLoading);
    }
    if (stage === 'mode') {
      if (!session || sessionUpdating) return false;
      if (!hasModeSteps) return true;
      return Boolean(activeModeStep && activeModeStep.selectedChoiceId);
    }
    if (stage === 'general') {
      return Boolean(session && !generalSaving);
    }
    return false;
  }, [stage, gameId, modeKey, sessionLoading, session, sessionUpdating, generalSaving, hasModeSteps, activeModeStep]);

  const canSubmit = useMemo(() => {
    if (!session || session.status !== 'summary' || !session.preview) return false;
    return (session.preview.errors?.length ?? 0) === 0 && !generalSaving && !sessionUpdating;
  }, [session, generalSaving, sessionUpdating]);

  const disableBack = stage === 'start' || sessionLoading;
  const disableNext = stage === 'summary' || !canProceed || sessionLoading || sessionUpdating || generalSaving;

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
    modeKey,
    setModeKey,

    // flags
    stage,
    bootstrapLoading,
    bootstrapError,
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

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length) return error;
  return fallback;
}

function mapStatusToStage(status: 'mode_config' | 'general' | 'summary'): ConfigSessionStage {
  if (status === 'summary') return 'summary';
  if (status === 'general') return 'general';
  return 'mode';
}
