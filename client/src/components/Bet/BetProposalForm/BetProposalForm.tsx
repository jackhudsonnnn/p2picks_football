import React, { useState, useMemo, useEffect } from "react";
import "./BetProposalForm.css";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";
import { modeRegistry } from "@features/bets/modes";
import { mergeConfig } from "@features/bets/modes/base";

type ModeKey = string;

export interface BetProposalFormValues {
  nfl_game_id: string;
  wager_amount: number;
  time_limit_seconds: number;
  mode: ModeKey;
  description: string;
  description2?: string;
  [key: string]: any;
}

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  loading?: boolean;
}
type GameOption = { id: string; label: string };

const MODE_OPTIONS: { value: ModeKey; label: string }[] = Object.values(
  modeRegistry
).map((m) => ({ value: m.key, label: m.label }));
const BetProposalForm: React.FC<BetProposalFormProps> = ({
  onSubmit,
  loading,
}) => {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<ModeKey>("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [wagerAmount, setWagerAmount] = useState<number>(1);
  const [timeLimit, setTimeLimit] = useState<number>(30);
  const [modeConfig, setModeConfig] = useState<any>({});
  const [availableGames, setAvailableGames] = useState<GameOption[]>([]);
  // Player lists are now fetched by each mode step (mode-specific), not here.

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    (async () => {
      try {
        const res = await fetch("/api/games", { signal });
        if (!res.ok) throw new Error(`games fetch failed: ${res.status}`);
        const data = await res.json();

        let options: GameOption[] = [];
        if (Array.isArray(data)) {
          options = data.map((g: any) => ({
            id: String(g.id || g.game_id || g.nfl_game_id),
            label: g.label || g.name || g.title || "",
          }));
        } else if (data && typeof data === "object") {
          options = Object.entries(data).map(([id, label]) => ({
            id,
            label: String(label),
          }));
        }

        setAvailableGames(options);
      } catch (e: any) {
        if (e.name === "AbortError") return;
        // swallow other errors for now; could set an error state later
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    // When the game changes, clear any mode-specific config so steps recompute as needed.
    setModeConfig({});
  }, [selectedGameId]);

  const selectedGame = useMemo(
    () => availableGames.find((g) => g.id === selectedGameId),
    [availableGames, selectedGameId]
  );
  const def = mode ? modeRegistry[mode] : undefined;
  const modeSteps = def?.FormSteps ?? [];
  const totalSteps = useMemo(() => {
    if (!mode) return 2;
    const dynamicSteps = modeSteps.length;
    return 2 /*wager+summary*/ + 1 /*select*/ + dynamicSteps;
  }, [mode, modeSteps]);

  const canNext = useMemo(() => {
    if (step === 0) return !!selectedGameId && !!mode;
    const dynamicStart = 1;
    const dynamicEndExclusive = dynamicStart + modeSteps.length;
    const isDynamicStep = step >= dynamicStart && step < dynamicEndExclusive;
    if (isDynamicStep) {
      const localIdx = step - dynamicStart;
      const validator = modeSteps[localIdx]?.validate || def?.validateConfig;
      if (validator) {
        try {
          validator(modeConfig);
        } catch {
          return false;
        }
      }
    }
    if (step === totalSteps - 2)
      return wagerAmount >= 1 && timeLimit >= 10 && timeLimit <= 60;
    return true;
  }, [
    step,
    mode,
    selectedGameId,
    def,
    modeConfig,
    wagerAmount,
    timeLimit,
    totalSteps,
    modeSteps,
  ]);

  const canSubmit = step === totalSteps - 1;

  const stepContent = () => {
    if (step === 0) {
      return (
        <div className="form-step">
          <div className="form-group">
            <label className="form-label" htmlFor="nfl_game">
              NFL Game
            </label>
            <select
              id="nfl_game"
              className="form-select"
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select NFL Game
              </option>
              {availableGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="mode">
              Game Mode
            </label>
            <select
              id="mode"
              className="form-select"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setModeConfig({});
                setStep(0);
              }}
              required
            >
              <option value="" disabled>
                Select Mode
              </option>
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    const dynamicStart = 1;
    const dynamicEndExclusive = dynamicStart + modeSteps.length;
    if (step >= dynamicStart && step < dynamicEndExclusive) {
      const localIdx = step - dynamicStart;
      const Renderer = modeSteps[localIdx].render;
      return (
        <div className="form-step">
          <Renderer
            value={modeConfig}
            onChange={(p: any) =>
              setModeConfig((prev: any) => mergeConfig(prev, p))
            }
            game={selectedGame}
          />
        </div>
      );
    }
    if (step === totalSteps - 2) {
      return (
        <div className="form-step">
          <div className="form-group">
            <label className="form-label" htmlFor="wager_amount">
              Wager (pts)
            </label>
            <input
              id="wager_amount"
              className="form-input"
              type="number"
              min={1}
              step={1}
              value={wagerAmount}
              onChange={(e) => setWagerAmount(Number(e.target.value))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="time_limit_seconds">
              Time Limit (seconds)
            </label>
            <input
              id="time_limit_seconds"
              className="form-input"
              type="number"
              min={10}
              max={60}
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              required
            />
          </div>
        </div>
      );
    }
    if (step === totalSteps - 1) {
      const description2 = def?.buildSecondaryDescription?.(modeConfig);
      return (
        <div className="form-step centered-step">
          <div>
            <strong>{selectedGame?.label || "Selected Matchup"}</strong>
          </div>
          <div>
            <strong>{wagerAmount} pt(s)</strong> • {timeLimit}s window
          </div>
          <div>{def?.summary({ config: modeConfig })}</div>
          <div>{description2}</div>
        </div>
      );
    }
    return null;
  };

  const handleNext = () => {
    if (canNext) setStep((s) => s + 1);
  };
  const handleBack = () => {
    setStep((s) => Math.max(0, s - 1));
  };
  const handleSubmit = () => {
    const description = def?.buildDescription
      ? def.buildDescription(modeConfig)
      : "Bet";
    const description2 = def?.buildSecondaryDescription?.(modeConfig);
    onSubmit({
      nfl_game_id: selectedGameId,
      wager_amount: wagerAmount,
      time_limit_seconds: timeLimit,
      mode,
      description,
      description2,
      ...modeConfig,
    });
  };

  return (
    <div className="bet-proposal-form">
      <div className="form-content">{stepContent()}</div>
      <div className="form-navigation">
        <button
          className="nav-button"
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          aria-label="Previous step"
          title="Previous step"
        >
          <IoIosArrowBack />
        </button>
        {canSubmit ? (
          <button
            className="submit-button"
            type="button"
            onClick={handleSubmit}
            disabled={loading}
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
            disabled={!canNext}
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
