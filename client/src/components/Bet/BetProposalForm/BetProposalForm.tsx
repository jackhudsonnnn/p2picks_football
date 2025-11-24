import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { formatToHundredth } from '@shared/utils/number';
import { fetchJSON } from '@data/clients/restClient';

type GameOption = { id: string; label: string };
type ModeOption = { key: string; label: string };

type ModeUserConfigChoiceDTO = {
  id: string;
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type ModeUserConfigStepDTO = {
  key: string;
  title: string;
  description?: string;
  validationErrors?: string[];
  selectedChoiceId?: string | null;
  completed?: boolean;
  choices: ModeUserConfigChoiceDTO[];
};

type ModePreview = {
  summary: string;
  description: string;
  secondary?: string;
  options: string[];
  winningCondition?: string;
  errors?: string[];
};

export interface BetProposalFormValues {
  config_session_id?: string;
  nfl_game_id?: string;
  mode_key?: string;
  mode_config?: Record<string, unknown>;
  wager_amount?: number;
  time_limit_seconds?: number;
  preview?: ModePreview | null;
}

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  loading?: boolean;
}

type ConfigSessionStage = 'start' | 'mode' | 'general' | 'summary';
type ConfigSessionStatus = 'mode_config' | 'general' | 'summary';

type GeneralConfigFieldSchema = {
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  choices: number[];
};

type GeneralConfigSchema = {
  wager_amount: GeneralConfigFieldSchema;
  time_limit_seconds: GeneralConfigFieldSchema;
};

type ModeConfigSessionDTO = {
  session_id: string;
  mode_key: string;
  nfl_game_id: string;
  status: ConfigSessionStatus;
  steps: ModeUserConfigStepDTO[];
  next_step: ModeUserConfigStepDTO | null;
  general: {
    wager_amount: number;
    time_limit_seconds: number;
  };
  general_schema: GeneralConfigSchema;
  preview: ModePreview | null;
};

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

const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, loading }) => {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [games, setGames] = useState<GameOption[]>([]);
  const [modes, setModes] = useState<ModeOption[]>([]);
  const [generalSchema, setGeneralSchema] = useState<GeneralConfigSchema | null>(null);

  const [gameId, setGameId] = useState('');
  const [modeKey, setModeKey] = useState('');

  const [stage, setStage] = useState<ConfigSessionStage>('start');
  const [manualStageOverride, setManualStageOverride] = useState(false);
  const [modeStepIndex, setModeStepIndex] = useState(0);

  const [session, setSession] = useState<ModeConfigSessionDTO | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [generalValues, setGeneralValues] = useState(DEFAULT_GENERAL_VALUES);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        setBootstrapLoading(true);
        setBootstrapError(null);
        const payload = await fetchJSON('/api/bet-proposals/bootstrap', {
          signal: controller.signal,
        });
        if (cancelled) return;
        const gameEntries: GameOption[] = Array.isArray(payload?.games)
          ? payload.games
              .map((item: any) => ({
                id: String(item?.id ?? ''),
                label: String(item?.label ?? ''),
              }))
              .filter((entry: GameOption) => entry.id && entry.label)
          : [];
        const modeEntries: ModeOption[] = Array.isArray(payload?.modes)
          ? payload.modes
              .map((item: any) => ({
                key: String(item?.key ?? ''),
                label: String(item?.label ?? item?.key ?? ''),
              }))
              .filter((entry: ModeOption) => entry.key && entry.label)
          : [];
        setGames(gameEntries);
        setModes(modeEntries);
        if (payload?.general_config_schema) {
          setGeneralSchema(payload.general_config_schema as GeneralConfigSchema);
          setGeneralValues({
            wager_amount: String(payload.general_config_schema?.wager_amount?.defaultValue ?? DEFAULT_GENERAL_VALUES.wager_amount),
            time_limit_seconds: String(
              payload.general_config_schema?.time_limit_seconds?.defaultValue ?? DEFAULT_GENERAL_VALUES.time_limit_seconds,
            ),
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

  useEffect(() => {
    if (!session) {
      return;
    }
    if (manualStageOverride) {
      return;
    }
    const derivedStage = mapStatusToStage(session.status);
    const noModeSteps = (session.steps?.length ?? 0) === 0;
    if (noModeSteps) {
      if (stage !== derivedStage) {
        setStage(derivedStage);
      }
      return;
    }
    if (stage === 'mode' && STAGE_ORDER[derivedStage] > STAGE_ORDER[stage]) {
      return;
    }
    if (STAGE_ORDER[derivedStage] > STAGE_ORDER[stage]) {
      setStage(derivedStage);
    }
  }, [session, stage, manualStageOverride]);

  useEffect(() => {
    if (!session) {
      if (stage !== 'start') {
        setStage('start');
      }
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

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!gameId || !modeKey) {
      resetSession();
      return;
    }
    if (session.mode_key !== modeKey || session.nfl_game_id !== gameId) {
      resetSession();
    }
  }, [gameId, modeKey, session, resetSession]);

  useEffect(() => {
    if (!session) {
      setModeStepIndex(0);
      return;
    }
    setModeStepIndex((prev) => {
      const lastIndex = Math.max(session.steps.length - 1, 0);
      if (prev > lastIndex) {
        return lastIndex;
      }
      if (prev < 0) {
        return 0;
      }
      return prev;
    });
  }, [session?.steps.length]);

  useEffect(() => {
    if (!session) {
      return;
    }
    setModeStepIndex(0);
  }, [session?.session_id]);

  const initializeSession = useCallback(async () => {
    if (!gameId || !modeKey) return;
    setSessionLoading(true);
    setSessionError(null);
    setManualStageOverride(false);
    try {
      const dto = await createConfigSessionRequest(modeKey, gameId);
      setSession(dto);
      setStage('mode');
    } catch (err) {
      setSessionError(extractErrorMessage(err, 'Unable to start configuration'));
    } finally {
      setSessionLoading(false);
    }
  }, [gameId, modeKey]);

  const handleChoiceChange = useCallback(
    async (stepKey: string, choiceId: string) => {
      if (!session || !choiceId || sessionUpdating) return;
      const current = session.steps.find((step) => step.key === stepKey);
      if (current?.selectedChoiceId === choiceId) return;
      setSessionUpdating(true);
      setSessionError(null);
      setManualStageOverride(false);
      try {
        const dto = await applyConfigChoiceRequest(session.session_id, stepKey, choiceId);
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
      const dto = await updateGeneralConfigRequest(session.session_id, {
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

  const handleBack = () => {
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
      }
      setStage('mode');
    } else if (stage === 'summary') {
      setStage('general');
    }
  };

  const handleNext = () => {
    if (stage === 'start') {
      void initializeSession();
      return;
    }
    if (stage === 'mode') {
      if (!session) {
        return;
      }
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
  };

  const handleSubmit = () => {
    if (!session || session.status !== 'summary' || !session.preview) return;
    if (session.preview.errors && session.preview.errors.length) return;
    onSubmit({
      config_session_id: session.session_id,
      nfl_game_id: session.nfl_game_id,
      mode_key: session.mode_key,
      wager_amount: session.general.wager_amount,
      time_limit_seconds: session.general.time_limit_seconds,
      preview: session.preview,
    });
  };

  const effectiveGeneralSchema = session?.general_schema || generalSchema;
  const activeModeStep = useMemo(() => {
    if (!session || !session.steps.length) {
      return null;
    }
    const clampedIndex = Math.min(Math.max(modeStepIndex, 0), session.steps.length - 1);
    return session.steps[clampedIndex];
  }, [session, modeStepIndex]);

  const hasModeSteps = Boolean(session && session.steps.length > 0);

  const canProceed = useMemo(() => {
    if (stage === 'start') {
      return Boolean(gameId && modeKey && !sessionLoading);
    }
    if (stage === 'mode') {
      if (!session || sessionUpdating) {
        return false;
      }
      if (!hasModeSteps) {
        return true;
      }
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
  const disableNext =
    stage === 'summary' || !canProceed || sessionLoading || sessionUpdating || generalSaving;

  const renderStartStage = () => (
    <div className="form-step combined-step">
      <div className="form-group">
        <label className="form-label" htmlFor="nfl_game_id">
          NFL Game
        </label>
        <select
          id="nfl_game_id"
          className="form-select"
          value={gameId}
          onChange={(event) => setGameId(event.target.value)}
          disabled={bootstrapLoading || sessionLoading}
        >
          <option value="">Select NFL Game</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="mode_key">
          Game Mode
        </label>
        <select
          id="mode_key"
          className="form-select"
          value={modeKey}
          onChange={(event) => setModeKey(event.target.value)}
          disabled={bootstrapLoading || sessionLoading}
        >
          <option value="">Select Mode</option>
          {modes.map((mode) => (
            <option key={mode.key} value={mode.key}>
              {mode.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderModeStage = () => {
    if (!session) {
      return <div className="form-step centered-step">Select an NFL game and mode to begin.</div>;
    }
    if (!session.steps.length) {
      return <div className="form-step centered-step">No additional configuration required for this mode.</div>;
    }
    const step = activeModeStep;
    if (!step) {
      return <div className="form-step centered-step">Loading configuration options…</div>;
    }
    return (
      <div className="form-step">
        <div className="form-group">
          <label className="form-label mode-step-label" htmlFor={`step-${step.key}`}>
            <span>{step.title}</span>
          </label>
          <select
            id={`step-${step.key}`}
            className="form-select"
            value={step.selectedChoiceId ?? ''}
            disabled={sessionUpdating}
            onChange={(event) => handleChoiceChange(step.key, event.target.value)}
          >
            <option value="">Select option</option>
            {step.choices.map((choice) => (
              <option key={choice.id} value={choice.id} disabled={choice.disabled}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const renderGeneralStage = () => {
    if (!session || !effectiveGeneralSchema) {
      return <div className="form-step centered-step">Configuration session unavailable.</div>;
    }
    const wagerField = effectiveGeneralSchema.wager_amount;
    const timeField = effectiveGeneralSchema.time_limit_seconds;
    return (
      <div className="form-step">
        <div className="form-group">
          <label className="form-label" htmlFor="general-wager">
            Wager ({wagerField.unit})
          </label>
          <select
            id="general-wager"
            className="form-select"
            value={generalValues.wager_amount}
            onChange={(event) => setGeneralValues((prev) => ({
              ...prev,
              wager_amount: event.target.value,
            }))}
            disabled={generalSaving}
          >
            {wagerField.choices.map((value) => (
              <option key={value} value={String(value)}>
                {formatToHundredth(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="general-time">
            Time Limit ({timeField.unit})
          </label>
          <select
            id="general-time"
            className="form-select"
            value={generalValues.time_limit_seconds}
            onChange={(event) => setGeneralValues((prev) => ({
              ...prev,
              time_limit_seconds: event.target.value,
            }))}
            disabled={generalSaving}
          >
            {timeField.choices.map((value) => (
              <option key={value} value={String(value)}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const renderSummaryStage = () => {
    if (!session) {
      return <div className="form-step centered-step">Configuration session missing.</div>;
    }
    if (!session.preview) {
      return <div className="form-step centered-step">Preview unavailable. Adjust selections or go back.</div>;
    }
    return (
      <div className="form-step centered-step">
        <div>
          <strong>{session.preview.description}</strong>
        </div>
        <div>
          {formatToHundredth(session.general.wager_amount)} pt(s) • {session.general.time_limit_seconds}s window
        </div>
        <div>{session.preview.summary}</div>
        {session.preview.winningCondition && <div>{session.preview.winningCondition}</div>}
      </div>
    );
  };

  let content: React.ReactNode;
  if (stage === 'start') {
    content = renderStartStage();
  } else if (stage === 'mode') {
    content = renderModeStage();
  } else if (stage === 'general') {
    content = renderGeneralStage();
  } else {
    content = renderSummaryStage();
  }

  return (
    <div className="bet-proposal-form">
      <div className="form-content">{content}</div>
      <div className="form-navigation">
        <button
          className="nav-button"
          type="button"
          onClick={handleBack}
          disabled={disableBack}
          aria-label="Previous step"
          title="Previous step"
        >
          <IoIosArrowBack />
        </button>
        {stage === 'summary' ? (
          <button
            className="submit-button"
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            aria-label="Submit bet"
            title="Submit bet"
          >
            Submit
          </button>
        ) : (
          <button
            className="nav-button"
            type="button"
            onClick={handleNext}
            disabled={disableNext}
            aria-label="Next step"
            title="Next step"
          >
            <IoIosArrowForward />
          </button>
        )}
      </div>
    </div>
  );
};

export default BetProposalForm;

function mapStatusToStage(status: ConfigSessionStatus): ConfigSessionStage {
  if (status === 'summary') return 'summary';
  if (status === 'general') return 'general';
  return 'mode';
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length) {
    return error;
  }
  return fallback;
}

async function createConfigSessionRequest(modeKey: string, nflGameId: string): Promise<ModeConfigSessionDTO> {
  return fetchJSON('/api/bet-proposals/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode_key: modeKey, nfl_game_id: nflGameId }),
  });
}

async function applyConfigChoiceRequest(
  sessionId: string,
  stepKey: string,
  choiceId: string,
): Promise<ModeConfigSessionDTO> {
  return fetchJSON(`/api/bet-proposals/sessions/${encodeURIComponent(sessionId)}/choices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step_key: stepKey, choice_id: choiceId }),
  });
}

async function updateGeneralConfigRequest(
  sessionId: string,
  general: { wager_amount: number; time_limit_seconds: number },
): Promise<ModeConfigSessionDTO> {
  return fetchJSON(`/api/bet-proposals/sessions/${encodeURIComponent(sessionId)}/general`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(general),
  });
}
