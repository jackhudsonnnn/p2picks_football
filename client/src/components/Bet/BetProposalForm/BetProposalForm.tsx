import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { formatToHundredth, normalizeToHundredth } from '@shared/utils/number';
import { fetchJSON } from '@data/clients/restClient';

type GameOption = { id: string; label: string };
type ModeOption = { key: string; label: string };
type ConfigChoice = {
  value: string;
  label: string;
  description?: string;
  patch?: Record<string, unknown>;
  disabled?: boolean;
};
type ConfigStep = {
  title: string;
  choices: ConfigChoice[];
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
  nfl_game_id: string;
  mode_key: string;
  mode_config: Record<string, unknown>;
  wager_amount: number;
  time_limit_seconds: number;
  preview?: ModePreview | null;
}

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  loading?: boolean;
}

function mapPayloadToConfigSteps(payloadSteps: any): ConfigStep[] {
  return Array.isArray(payloadSteps)
    ? payloadSteps.map((entry: any) => {
        const title = Array.isArray(entry) ? entry[0] : entry?.title;
        const rawChoices = Array.isArray(entry) ? entry[1] : entry?.choices;
        const choices: ConfigChoice[] = Array.isArray(rawChoices)
          ? rawChoices.map((choice: any) => ({
              value: String(choice?.value ?? choice?.id ?? ''),
              label: String(choice?.label ?? choice?.name ?? choice?.value ?? ''),
              description: choice?.description ? String(choice.description) : undefined,
              disabled: Boolean(choice?.disabled),
              patch:
                choice?.patch && typeof choice.patch === 'object'
                  ? { ...(choice.patch as Record<string, unknown>) }
                  : undefined,
            }))
          : [];
        return {
          title: String(title ?? 'Select Option'),
          choices,
        };
      })
    : [];
}

const WAGER_CHOICES = Array.from({ length: 20 }).map((_, index) => {
  const raw = normalizeToHundredth(0.25 * (index + 1));
  return Number(raw);
});

const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, loading }) => {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [games, setGames] = useState<GameOption[]>([]);
  const [modes, setModes] = useState<ModeOption[]>([]);

  const [gameId, setGameId] = useState<string>('');
  const [modeKey, setModeKey] = useState<string>('');

  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [configSteps, setConfigSteps] = useState<ConfigStep[]>([]);
  const [configSelections, setConfigSelections] = useState<(string | null)[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [wagerAmount, setWagerAmount] = useState<number>(0.25);
  const [timeLimit, setTimeLimit] = useState<number>(30);

  const [step, setStep] = useState<number>(0);

  const [preview, setPreview] = useState<ModePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
              .filter((item: GameOption) => item.id && item.label)
          : Object.entries(payload?.games || {}).map(([id, label]) => ({
              id: String(id),
              label: String(label ?? id),
            }));

        const modeEntries: ModeOption[] = Array.isArray(payload?.modes)
      ? payload.modes
        .map((def: any) => ({ key: String(def?.key ?? ''), label: String(def?.label ?? def?.key ?? '') }))
        .filter((item: ModeOption) => item.key && item.label)
          : [];

        setGames(gameEntries);
        setModes(modeEntries);
      } catch (err: any) {
        if (!cancelled) {
          setBootstrapError(err?.message || 'Unable to load bet proposal setup');
          setGames([]);
          setModes([]);
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
    setConfig({});
    setConfigSteps([]);
    setConfigSelections([]);
    setPreview(null);
    setPreviewError(null);
    setStep((current) => (current > 0 ? 0 : current));
  }, [gameId, modeKey]);

  const fetchUserConfigSteps = useCallback(
    async (nextConfig: Record<string, unknown>, signal?: AbortSignal): Promise<ConfigStep[]> => {
      if (!gameId || !modeKey) return [];
      const payloadConfig = { ...(nextConfig || {}), nfl_game_id: gameId };
      const payload = await fetchJSON(`/api/bet-modes/${encodeURIComponent(modeKey)}/user-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfl_game_id: gameId, config: payloadConfig }),
        signal,
      });
      return mapPayloadToConfigSteps(payload?.steps);
    },
    [gameId, modeKey],
  );

  useEffect(() => {
    if (!gameId || !modeKey) return;

    const controller = new AbortController();
    let cancelled = false;
    const baseConfig: Record<string, unknown> = { nfl_game_id: gameId };

    (async () => {
      try {
        setConfigLoading(true);
        setConfigError(null);
        const steps = await fetchUserConfigSteps(baseConfig, controller.signal);
        if (cancelled) return;
        setConfig({ ...baseConfig });
        setConfigSteps(steps);
        setConfigSelections(Array(steps.length).fill(null));
      } catch (err: any) {
        if (!cancelled) {
          setConfig({ ...baseConfig });
          setConfigSteps([]);
          setConfigSelections([]);
          setConfigError(err?.message || 'Unable to load configuration');
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [gameId, modeKey, fetchUserConfigSteps]);

  const totalConfigSteps = configSteps.length;
  // Now that NFL game + mode are selected together in step 0, config steps begin at index 1
  const configStartIndex = 1;
  const generalStepIndex = configStartIndex + totalConfigSteps;
  const reviewStepIndex = generalStepIndex + 1;
  const totalSteps = reviewStepIndex + 1;

  const configSelectionsComplete = useMemo(
    () => configSelections.length === totalConfigSteps && configSelections.every((value) => value != null),
    [configSelections, totalConfigSteps],
  );

  const configSignature = useMemo(() => JSON.stringify(config), [config]);

  useEffect(() => {
    if (step !== reviewStepIndex) return;
    if (!gameId || !modeKey) return;
    if (totalConfigSteps > 0 && !configSelectionsComplete) return;

    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        setPreviewLoading(true);
        setPreviewError(null);
        const payload = {
          nfl_game_id: gameId,
          config,
          wager_amount: normalizeToHundredth(wagerAmount),
          time_limit_seconds: timeLimit,
        };
        const data: ModePreview = await fetchJSON(`/api/bet-modes/${encodeURIComponent(modeKey)}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (cancelled) return;
        setPreview(data);
      } catch (err: any) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err?.message || 'Unable to build preview');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [step, reviewStepIndex, gameId, modeKey, configSignature, wagerAmount, timeLimit, totalConfigSteps, configSelectionsComplete]);

  const stepValid = useMemo(() => {
    // combined first step requires both game and mode
    if (step === 0) return !!gameId && !!modeKey;
    if (step >= configStartIndex && step < generalStepIndex) {
      const localIndex = step - configStartIndex;
      return configSelections[localIndex] != null;
    }
    if (step === generalStepIndex) {
      const wagerValid = wagerAmount >= 0.25 && wagerAmount <= 5;
      const timeValid = timeLimit >= 15 && timeLimit <= 120;
      return wagerValid && timeValid;
    }
    return step <= reviewStepIndex;
  }, [step, gameId, modeKey, configSelections, generalStepIndex, configStartIndex, wagerAmount, timeLimit, reviewStepIndex]);

  const canSubmit = step === reviewStepIndex && !previewLoading && !previewError && (preview?.errors?.length ?? 0) === 0;

  const disableNext = !stepValid || (step === reviewStepIndex - 1 && !configSelectionsComplete && totalConfigSteps > 0);

  const handleConfigSelection = (stepIndex: number, value: string) => {
    const choice = configSteps[stepIndex]?.choices.find((option) => String(option.value) === value);
    if (!choice) return;
    const patch = choice.patch && typeof choice.patch === 'object' ? choice.patch : {};
    if (
      patch &&
      'player2_id' in patch &&
      config.player1_id &&
      String((patch as Record<string, unknown>).player2_id) === String(config.player1_id)
    ) {
      return;
    }
    setConfigSelections((prev) => {
      const next = [...prev];
      next[stepIndex] = value;
      return next;
    });

    setPreview(null);
    setPreviewError(null);

    const prevStat = typeof config?.stat === 'string' ? String(config.stat) : undefined;
    const statChanged = 'stat' in patch && String(patch.stat ?? '') !== String(prevStat ?? '');

    const nextConfig = { ...(config || {}), ...patch, nfl_game_id: gameId };

    if (statChanged) {
      Object.assign(nextConfig, {
        player1_id: null,
        player1_name: null,
        player2_id: null,
        player2_name: null,
        player_id: null,
        player_name: null,
      });
    }

    setConfig(nextConfig);

    if (statChanged) {
      (async () => {
        try {
          setConfigLoading(true);
          setConfigError(null);
          const steps = await fetchUserConfigSteps(nextConfig);
          setConfigSteps(steps);
          setConfigSelections(() => {
            const nextSelections = Array(steps.length).fill(null);
            nextSelections[stepIndex] = value;
            return nextSelections;
          });
        } catch (err: any) {
          setConfigSteps([]);
          setConfigSelections([]);
          setConfigError(err?.message || 'Unable to load configuration');
        } finally {
          setConfigLoading(false);
        }
      })();
    }
  };

  const goNext = () => {
    if (step < totalSteps - 1 && !disableNext) {
      setStep((current) => Math.min(current + 1, totalSteps - 1));
    }
  };

  const goBack = () => {
    if (step > 0) {
      setStep((current) => Math.max(current - 1, 0));
    }
  };

  const handleSubmit = () => {
    if (!gameId || !modeKey) return;
    const payload: BetProposalFormValues = {
      nfl_game_id: gameId,
      mode_key: modeKey,
      mode_config: { ...(config || {}) },
      wager_amount: normalizeToHundredth(Math.min(Math.max(wagerAmount, 0.25), 5)),
  time_limit_seconds: Math.min(Math.max(Math.round(timeLimit), 15), 120),

      preview,
    };
    onSubmit(payload);
  };

  const renderConfigStep = (configIndex: number) => {
    const stepDef = configSteps[configIndex];
    if (!stepDef) return null;
    const selection = configSelections[configIndex] ?? '';
    const choices = stepDef.choices.map((choice) => {
      let disabled = Boolean(choice.disabled);
      const patch = choice.patch as Record<string, unknown> | undefined;
      if (patch && 'player2_id' in patch && config.player1_id && String(patch.player2_id) === String(config.player1_id)) {
        disabled = true;
      }
      return { ...choice, disabled };
    });

    const selectedChoice = choices.find((choice) => choice.value === selection);

    return (
      <div className="form-step">
        <div className="form-group">
          <label className="form-label">{stepDef.title}</label>
          <select
            className="form-select"
            value={selection}
            onChange={(event) => handleConfigSelection(configIndex, event.target.value)}
          >
            <option value="">Select option</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value} disabled={choice.disabled}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        {selectedChoice?.description && <div className="form-hint">{selectedChoice.description}</div>}
      </div>
    );
  };

  const renderReviewStep = () => {
    if (previewLoading) {
      return <div className="form-step centered-step">Building preview…</div>;
    }
    if (previewError) {
      return (
        <div className="form-step centered-step">
          <div className="form-error" role="alert">
            {previewError}
          </div>
        </div>
      );
    }
    if (!preview) {
      return <div className="form-step centered-step">Preview unavailable. Adjust selections or go back.</div>;
    }
    if (preview.errors && preview.errors.length) {
      return (
        <div className="form-step centered-step">
          <div className="form-error" role="alert">
            {preview.errors.join('; ')}
          </div>
        </div>
      );
    }
    return (
      <div className="form-step centered-step">
        <div><strong>{preview.description}</strong></div>
        <div>
          {formatToHundredth(wagerAmount)} pt(s)• {timeLimit}s window
        </div>
        <div>
          {preview.summary}
        </div>
        {preview.winningCondition}
      </div>
    );
  };

  const renderStepContent = () => {
    // Combined first step: select NFL game and mode in a single UI
    if (step === 0) {
      return (
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
              disabled={bootstrapLoading}
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
              disabled={bootstrapLoading}
            >
              <option value="">Select Mode</option>
              {modes.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          {bootstrapError && (
            <div className="form-error" role="alert">
              {bootstrapError}
            </div>
          )}
        </div>
      );
    }

    if (step >= configStartIndex && step < generalStepIndex) {
      const configIndex = step - configStartIndex;
      if (configLoading) {
        return <div className="form-step centered-step">Loading options…</div>;
      }
      if (configError) {
        return (
          <div className="form-step centered-step">
            <div className="form-error" role="alert">
              {configError}
            </div>
          </div>
        );
      }
      return renderConfigStep(configIndex);
    }

    if (step === generalStepIndex) {
      return (
        <div className="form-step">
          <div className="form-group">
            <label className="form-label" htmlFor="wager_amount">
              Wager (pts)
            </label>
            <select
              id="wager_amount"
              className="form-select"
              value={String(wagerAmount)}
              onChange={(event) => setWagerAmount(Number(event.target.value))}
            >
              <option value="">Select wager</option>
              {WAGER_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {formatToHundredth(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="time_limit">
              Time Limit (seconds)
            </label>
            <select
              id="time_limit"
              className="form-select"
              value={String(timeLimit)}
              onChange={(event) => setTimeLimit(Number(event.target.value))}
            >
              <option value="">Select time limit</option>
              {Array.from({ length: 8 }).map((_, i) => {
                const val = 15 * (i + 1); // 15,30,...,120
                return (
                  <option key={val} value={val}>
                    {val}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      );
    }

    return renderReviewStep();
  };

  return (
    <div className="bet-proposal-form">
      <div className="form-content">{renderStepContent()}</div>
      <div className="form-navigation">
        <button
          className="nav-button"
          type="button"
          onClick={goBack}
          disabled={step === 0}
          aria-label="Previous step"
          title="Previous step"
        >
          <IoIosArrowBack />
        </button>
        {step === reviewStepIndex ? (
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
            onClick={goNext}
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
