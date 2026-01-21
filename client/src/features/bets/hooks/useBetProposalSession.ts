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
  // U2Pick-specific
  u2pick_winning_condition?: string;
  u2pick_options?: string[];
};

export type ConfigSessionStage =
  | 'league'
  | 'start'
  | 'mode'
  | 'general'
  | 'summary'
  | 'u2pick_condition'
  | 'u2pick_options';

const STAGE_ORDER: Record<ConfigSessionStage, number> = {
  league: 0,
  start: 1,
  u2pick_condition: 1.5,
  u2pick_options: 1.6,
  mode: 2,
  general: 3,
  summary: 4,
};

// U2Pick validation constants
const U2PICK_CONDITION_MIN = 4;
const U2PICK_CONDITION_MAX = 70;
const U2PICK_OPTION_MIN = 1;
const U2PICK_OPTION_MAX = 40;
const U2PICK_OPTIONS_MIN_COUNT = 2;
const U2PICK_OPTIONS_MAX_COUNT = 6;

const DEFAULT_GENERAL_VALUES = {
  wager_amount: '0.25',
  time_limit_seconds: '30',
};

type ModeEntry = {
  key: string;
  label: string;
  available?: boolean;
  supportedLeagues?: League[];
};

const ALLOWED_LEAGUES: League[] = ['U2Pick', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF'];
const ACTIVE_LEAGUES: League[] = ['U2Pick', 'NFL'];

const U2PICK_PLACEHOLDER_GAME = { id: 'u2pick-custom', label: 'Custom bet (no game required)' } as const;
const U2PICK_PLACEHOLDER_MODE: ModeEntry = {
  key: 'u2pick',
  label: 'U2Pick (custom bet)',
  available: true,
  supportedLeagues: ['U2Pick'],
};

export function useBetProposalSession(onSubmit: (values: BetProposalFormValues) => void) {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [games, setGames] = useState<{ id: string; label: string }[]>([]);
  const [bootstrapGames, setBootstrapGames] = useState<{ id: string; label: string }[]>([]);
  const [modes, setModes] = useState<ModeEntry[]>([]);
  const [generalSchema, setGeneralSchema] = useState<BetGeneralConfigSchema | null>(null);

  const [gameId, setGameId] = useState('');
  const [league, setLeague] = useState<'U2Pick' | 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF'>('U2Pick');
  const [modeKey, setModeKey] = useState('');

  const [stage, setStage] = useState<ConfigSessionStage>('league');
  const [manualStageOverride, setManualStageOverride] = useState(false);
  const [modeStepIndex, setModeStepIndex] = useState(0);

  const [session, setSession] = useState<BetConfigSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [generalValues, setGeneralValues] = useState(DEFAULT_GENERAL_VALUES);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // U2Pick-specific state
  const [u2pickCondition, setU2pickCondition] = useState('');
  const [u2pickOptions, setU2pickOptions] = useState<string[]>(['', '']);

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
              .map((item: any) => {
                const supportedLeaguesRaw = item?.supportedLeagues ?? item?.metadata?.supportedLeagues;
                const supportedLeagues = Array.isArray(supportedLeaguesRaw)
                  ? supportedLeaguesRaw
                      .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
                      .filter((value: string): value is League => (ALLOWED_LEAGUES as string[]).includes(value as string))
                  : undefined;

                const available = item?.available ?? item?.enabled ?? item?.isAvailable ?? item?.metadata?.available ?? true;

                return {
                  key: String(item?.key ?? ''),
                  label: String(item?.label ?? item?.key ?? ''),
                  available: available !== false,
                  supportedLeagues,
                } satisfies ModeEntry;
              })
              .filter((entry) => entry.key && entry.label)
          : [];
  setGames(gameEntries);
  setBootstrapGames(gameEntries);
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
      if (stage !== 'league' && stage !== 'start') setStage('start');
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

  // League-specific defaults/placeholders
  useEffect(() => {
    if (league === 'U2Pick') {
      // Ensure a placeholder game/mode is present so the UI can render selections, but keep them disabled
      setGames([U2PICK_PLACEHOLDER_GAME]);
      setGameId((prev) => (prev ? prev : U2PICK_PLACEHOLDER_GAME.id));

      setModes((prevModes) => {
        const hasU2Pick = prevModes.some((mode) => mode.key === U2PICK_PLACEHOLDER_MODE.key);
        return hasU2Pick ? prevModes : [...prevModes, U2PICK_PLACEHOLDER_MODE];
      });
      setModeKey((prev) => (prev ? prev : U2PICK_PLACEHOLDER_MODE.key));
      return;
    }

    // Reset placeholder selections when switching away
    setModeKey((prev) => (prev === U2PICK_PLACEHOLDER_MODE.key ? '' : prev));
    setGameId((prev) => (prev === U2PICK_PLACEHOLDER_GAME.id ? '' : prev));
    setModes((prevModes) => prevModes.filter((mode) => mode.key !== U2PICK_PLACEHOLDER_MODE.key));
    setGames(bootstrapGames);
  }, [league, bootstrapGames]);

  // Clear mode selection if it becomes unavailable for the current league
  useEffect(() => {
    if (!modeKey) return;
    const selectedMode = modes.find((mode) => mode.key === modeKey);
    if (!computeModeAvailability(selectedMode, league)) {
      setModeKey('');
    }
  }, [league, modeKey, modes]);

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
    if (stage === 'league') return;
    if (stage === 'start') {
      setStage('league');
      return;
    }
    setManualStageOverride(true);

    // U2Pick-specific back navigation
    if (stage === 'u2pick_condition') {
      setStage('league');
      return;
    }
    if (stage === 'u2pick_options') {
      setStage('u2pick_condition');
      return;
    }

    if (stage === 'mode') {
      if (modeStepIndex > 0) {
        setModeStepIndex((prev) => Math.max(prev - 1, 0));
      } else {
        resetSession();
      }
    } else if (stage === 'general') {
      if (league === 'U2Pick') {
        setStage('u2pick_options');
      } else if (session?.steps.length) {
        setModeStepIndex(session.steps.length - 1);
        setStage('mode');
      } else {
        // If there were no mode-specific steps, the previous logical stage is start
        setStage('start');
      }
    } else if (stage === 'summary') {
      setStage('general');
    }
  }, [stage, modeStepIndex, resetSession, session?.steps.length, league]);

  const selectedMode = useMemo(() => modes.find((mode) => mode.key === modeKey) || null, [modes, modeKey]);
  const selectedModeAvailable = useMemo(
    () => computeModeAvailability(selectedMode, league),
    [selectedMode, league],
  );

  const handleNext = useCallback(() => {
    if (stage === 'league') {
      if (!ACTIVE_LEAGUES.includes(league)) return;
      // U2Pick has its own flow
      if (league === 'U2Pick') {
        setStage('u2pick_condition');
        return;
      }
      setStage('start');
      return;
    }

    // U2Pick-specific forward navigation
    if (stage === 'u2pick_condition') {
      const trimmed = u2pickCondition.trim();
      if (trimmed.length < U2PICK_CONDITION_MIN || trimmed.length > U2PICK_CONDITION_MAX) return;
      setStage('u2pick_options');
      return;
    }
    if (stage === 'u2pick_options') {
      const validOptions = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= U2PICK_OPTION_MIN && o.length <= U2PICK_OPTION_MAX);
      if (validOptions.length < U2PICK_OPTIONS_MIN_COUNT) return;
      setStage('general');
      return;
    }

    if (stage === 'start') {
      if (!computeModeAvailability(modes.find((mode) => mode.key === modeKey), league)) return;
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
      // For U2Pick, go directly to summary
      if (league === 'U2Pick') {
        setStage('summary');
        return;
      }
      void handleGeneralSubmit();
    }
  }, [stage, league, u2pickCondition, u2pickOptions, modes, modeKey, initializeSession, session, modeStepIndex, handleGeneralSubmit]);

  const handleSubmit = useCallback(() => {
    // U2Pick direct submission
    if (league === 'U2Pick') {
      const trimmedCondition = u2pickCondition.trim();
      const validOptions = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= U2PICK_OPTION_MIN && o.length <= U2PICK_OPTION_MAX);
      if (trimmedCondition.length < U2PICK_CONDITION_MIN || validOptions.length < U2PICK_OPTIONS_MIN_COUNT) return;
      onSubmit({
        league: 'U2Pick',
        mode_key: 'u2pick',
        wager_amount: Number(generalValues.wager_amount),
        time_limit_seconds: Number(generalValues.time_limit_seconds),
        u2pick_winning_condition: trimmedCondition,
        u2pick_options: validOptions,
        preview: {
          summary: trimmedCondition,
          description: trimmedCondition,
          options: validOptions,
          winningCondition: trimmedCondition,
        },
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
  }, [session, onSubmit, league, u2pickCondition, u2pickOptions, generalValues]);

  const effectiveGeneralSchema = session?.general_schema || generalSchema;
  const activeModeStep: BetModeUserConfigStep | null = useMemo(() => {
    if (!session || !session.steps.length) return null;
    const clampedIndex = Math.min(Math.max(modeStepIndex, 0), session.steps.length - 1);
    return session.steps[clampedIndex];
  }, [session, modeStepIndex]);

  const hasModeSteps = Boolean(session && session.steps.length > 0);

  const canProceed = useMemo(() => {
    if (stage === 'league') {
      return Boolean(ACTIVE_LEAGUES.includes(league) && !sessionLoading);
    }
    if (stage === 'u2pick_condition') {
      const trimmed = u2pickCondition.trim();
      return trimmed.length >= U2PICK_CONDITION_MIN && trimmed.length <= U2PICK_CONDITION_MAX;
    }
    if (stage === 'u2pick_options') {
      const validOptions = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= U2PICK_OPTION_MIN && o.length <= U2PICK_OPTION_MAX);
      return validOptions.length >= U2PICK_OPTIONS_MIN_COUNT;
    }
    if (stage === 'start') {
      return Boolean(gameId && modeKey && league && !sessionLoading && selectedModeAvailable);
    }
    if (stage === 'mode') {
      if (!session || sessionUpdating) return false;
      if (!hasModeSteps) return true;
      return Boolean(activeModeStep && activeModeStep.selectedChoiceId);
    }
    if (stage === 'general') {
      // U2Pick uses local general values, not a session
      if (league === 'U2Pick') {
        return !generalSaving;
      }
      return Boolean(session && !generalSaving);
    }
    return false;
  }, [
    stage,
    gameId,
    modeKey,
    league,
    sessionLoading,
    session,
    sessionUpdating,
    generalSaving,
    hasModeSteps,
    activeModeStep,
    selectedModeAvailable,
    u2pickCondition,
    u2pickOptions,
  ]);

  const canSubmit = useMemo(() => {
    // U2Pick direct submission
    if (league === 'U2Pick' && stage === 'summary') {
      const trimmed = u2pickCondition.trim();
      const validOptions = u2pickOptions.map((o) => o.trim()).filter((o) => o.length >= U2PICK_OPTION_MIN && o.length <= U2PICK_OPTION_MAX);
      return trimmed.length >= U2PICK_CONDITION_MIN && validOptions.length >= U2PICK_OPTIONS_MIN_COUNT && !generalSaving;
    }
    if (!session || session.status !== 'summary' || !session.preview) return false;
    return (session.preview.errors?.length ?? 0) === 0 && !generalSaving && !sessionUpdating;
  }, [session, generalSaving, sessionUpdating, league, stage, u2pickCondition, u2pickOptions]);

  const disableBack = stage === 'league' || sessionLoading;
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

    // U2Pick state
    u2pickCondition,
    setU2pickCondition,
    u2pickOptions,
    setU2pickOptions,
    u2pickValidation: {
      conditionMin: U2PICK_CONDITION_MIN,
      conditionMax: U2PICK_CONDITION_MAX,
      optionMin: U2PICK_OPTION_MIN,
      optionMax: U2PICK_OPTION_MAX,
      optionsMinCount: U2PICK_OPTIONS_MIN_COUNT,
      optionsMaxCount: U2PICK_OPTIONS_MAX_COUNT,
    },

    // availability
    selectedModeAvailable,
    isModeAvailable: (key: string, currentLeague: League = league) =>
      computeModeAvailability(modes.find((mode) => mode.key === key), currentLeague),

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

function computeModeAvailability(mode: ModeEntry | null | undefined, league: League): boolean {
  if (!mode) return false;
  if (Array.isArray(mode.supportedLeagues) && mode.supportedLeagues.length) {
    return mode.supportedLeagues.includes(league);
  }
  return mode.available !== false;
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
