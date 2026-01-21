import React, { useState } from 'react';
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { formatToHundredth } from '@shared/utils/number';
import {
  useBetProposalSession,
  type BetProposalFormValues,
} from '@features/bets/hooks/useBetProposalSession';
import { Modal } from '@shared/widgets/Modal/Modal';
import { PlusIcon } from '@shared/widgets/icons/PlusIcon';
import { XIcon } from '@shared/widgets/icons/XIcon';

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  loading?: boolean;
}

const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, loading }) => {
  const [showLeagueModal, setShowLeagueModal] = useState(false);
  const {
    games,
    modes,
    generalValues,
    setGeneralValues,
    effectiveGeneralSchema,
    generalSchema,
    session,
    activeModeStep,
    gameId,
    setGameId,
    league,
    setLeague,
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
    selectedModeAvailable,
    isModeAvailable,
    u2pickCondition,
    setU2pickCondition,
    u2pickOptions,
    setU2pickOptions,
    u2pickValidation,
  } = useBetProposalSession(onSubmit);

  const handleLeagueChange = (value: string) => {
    setLeague(value as any);
    if (value !== 'NFL' && value !== 'U2Pick') {
      setShowLeagueModal(true);
    }
  };

  const renderLeagueStage = () => (
    <div>
      <div className="form-group">
        <label className="form-label" htmlFor="league">
          Choose League
        </label>
        <select
          id="league"
          className="form-select"
          value={league}
          onChange={(event) => handleLeagueChange(event.target.value)}
          disabled={bootstrapLoading || sessionLoading}
        >
          {['U2Pick', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <Modal
        isOpen={showLeagueModal}
        onClose={() => setShowLeagueModal(false)}
        title="More leagues coming soon"
        footer={(
          <button className="submit-button" type="button" onClick={() => setShowLeagueModal(false)}>
            Got it
          </button>
        )}
      >
        <p>
          NBA, MLB, NHL, and NCAAF are on the roadmap. Only NFL and U2Pick bets are enabled today.
        </p>
      </Modal>
    </div>
  );

  const renderU2PickConditionStage = () => (
    <div className="form-step">
      <div className="form-group">
        <label className="form-label" htmlFor="u2pick-condition">
          Winning Condition
        </label>
        <input
          id="u2pick-condition"
          type="text"
          className="form-input"
          placeholder="e.g. Who will score first?"
          value={u2pickCondition}
          onChange={(e) => setU2pickCondition(e.target.value)}
          minLength={u2pickValidation.conditionMin}
          maxLength={u2pickValidation.conditionMax}
        />
        <div className="form-helper-text">
          {u2pickCondition.trim().length}/{u2pickValidation.conditionMax} characters
          {u2pickCondition.trim().length < u2pickValidation.conditionMin && (
            <span> (min {u2pickValidation.conditionMin})</span>
          )}
        </div>
      </div>
    </div>
  );

  const handleU2PickOptionChange = (index: number, value: string) => {
    setU2pickOptions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddU2PickOption = () => {
    if (u2pickOptions.length >= u2pickValidation.optionsMaxCount) return;
    setU2pickOptions((prev) => [...prev, '']);
  };

  const handleRemoveU2PickOption = (index: number) => {
    if (u2pickOptions.length <= u2pickValidation.optionsMinCount) return;
    setU2pickOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const renderU2PickOptionsStage = () => (
    <div className="form-step">
      <div className="form-group">
        <label className="form-label">
          Options ({u2pickValidation.optionsMinCount}-{u2pickValidation.optionsMaxCount})
        </label>
        {u2pickOptions.map((option, index) => (
          <div key={index} className="u2pick-option-row">
            <input
              type="text"
              className="form-input"
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(e) => handleU2PickOptionChange(index, e.target.value)}
              minLength={u2pickValidation.optionMin}
              maxLength={u2pickValidation.optionMax}
            />
            {u2pickOptions.length > u2pickValidation.optionsMinCount && (
              <button
                type="button"
                className="u2pick-option-remove"
                onClick={() => handleRemoveU2PickOption(index)}
                aria-label={`Remove option ${index + 1}`}
              >
                <XIcon />
              </button>
            )}
          </div>
        ))}
        {u2pickOptions.length < u2pickValidation.optionsMaxCount && (
          <button
            type="button"
            className="u2pick-add-option"
            onClick={handleAddU2PickOption}
          >
            <PlusIcon /> Add Option
          </button>
        )}
      </div>
    </div>
  );

  const renderStartStage = () => (
    <div>
      <div className="form-group">
        <label className="form-label" htmlFor="league_game_id">
          Game
        </label>
        <select
          id="league_game_id"
          className="form-select"
          value={gameId}
          onChange={(event) => setGameId(event.target.value)}
          disabled={bootstrapLoading || sessionLoading}
        >
          <option value="">Select Game</option>
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
          {modes.map((mode) => {
            const available = isModeAvailable(mode.key, league);
            return (
              <option key={mode.key} value={mode.key} disabled={!available}>
                {available ? mode.label : `${mode.label} (coming soon)`}
              </option>
            );
          })}
        </select>
        {!selectedModeAvailable && modeKey && (
          <div className="form-helper-text">That mode is not available yet for this league.</div>
        )}
      </div>
    </div>
  );

  const renderModeStage = () => {
    if (!session) {
      return <div className="form-step centered-step">Select a game and mode to begin.</div>;
    }
    if (!session.steps.length) {
      return null;
    }
    const step = activeModeStep;
    if (!step) {
      return <div className="form-step centered-step">Loading configuration options...</div>;
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
    const schema = league === 'U2Pick' ? generalSchema : effectiveGeneralSchema;
    if (!schema) {
      return <div className="form-step centered-step">Configuration unavailable.</div>;
    }
    const wagerField = schema.wager_amount;
    const timeField = schema.time_limit_seconds;
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
    if (league === 'U2Pick') {
      const validOptions = u2pickOptions
        .map((o) => o.trim())
        .filter((o) => o.length >= u2pickValidation.optionMin);
      return (
        <div className="form-step centered-step">
          <div>
            <strong>{u2pickCondition.trim()}</strong>
          </div>
          <div>
            ${formatToHundredth(Number(generalValues.wager_amount))} • {generalValues.time_limit_seconds}s window
          </div>
          <div className="u2pick-summary-options">
            {validOptions.map((opt, i) => (
              <span key={i} className="u2pick-summary-option">{opt}</span>
            ))}
          </div>
        </div>
      );
    }
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
  if (stage === 'league') {
    content = renderLeagueStage();
  } else if (stage === 'u2pick_condition') {
    content = renderU2PickConditionStage();
  } else if (stage === 'u2pick_options') {
    content = renderU2PickOptionsStage();
  } else if (stage === 'start') {
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
