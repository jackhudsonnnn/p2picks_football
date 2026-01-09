import React from 'react';
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { formatToHundredth } from '@shared/utils/number';
import {
  useBetProposalSession,
  type BetProposalFormValues,
} from '@features/bets/hooks/useBetProposalSession';

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  loading?: boolean;
}

const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, loading }) => {
  const {
    games,
    modes,
    generalValues,
    setGeneralValues,
    effectiveGeneralSchema,
    session,
    activeModeStep,
    gameId,
    setGameId,
    modeKey,
    setModeKey,
    stage,
    bootstrapLoading,
    sessionLoading,
    sessionUpdating,
    generalSaving,
    canSubmit,
    disableBack,
    disableNext,
    handleBack,
    handleNext,
    handleChoiceChange,
    handleSubmit,
  } = useBetProposalSession(onSubmit);


  const renderStartStage = () => (
    <div>
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
      return null;
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
          ${formatToHundredth(session.general.wager_amount)} • {session.general.time_limit_seconds}s window
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
