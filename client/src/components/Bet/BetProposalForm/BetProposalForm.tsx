import React from 'react';
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import {
  useBetProposalSession,
  type BetProposalFormValues,
} from '@features/bets/hooks/useBetProposalSession';
import { LeagueStage } from './LeagueStage';
import { StartStage } from './StartStage';
import { ModeStage } from './ModeStage';
import { U2PickConditionStage, U2PickOptionsStage } from './U2PickStages';
import { GeneralStage } from './GeneralStage';
import { SummaryStage } from './SummaryStage';

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
    generalSchema,
    session,
    activeModeStep,
    gameId,
    setGameId,
    league,
    setLeague,
    activeLeagues,
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
    isModeAvailable,
    u2pickCondition,
    setU2pickCondition,
    u2pickOptions,
    setU2pickOptions,
    u2pickValidation,
  } = useBetProposalSession(onSubmit);

  const formDisabled = bootstrapLoading || sessionLoading;

  let content: React.ReactNode;
  if (stage === 'league') {
    content = (
      <LeagueStage
        league={league}
        activeLeagues={activeLeagues}
        onLeagueChange={setLeague}
        disabled={formDisabled}
      />
    );
  } else if (stage === 'u2pick_condition') {
    content = (
      <U2PickConditionStage
        condition={u2pickCondition}
        onConditionChange={setU2pickCondition}
        validation={u2pickValidation}
      />
    );
  } else if (stage === 'u2pick_options') {
    content = (
      <U2PickOptionsStage
        options={u2pickOptions}
        onOptionsChange={setU2pickOptions}
        validation={u2pickValidation}
      />
    );
  } else if (stage === 'start') {
    content = (
      <StartStage
        gameId={gameId}
        onGameChange={setGameId}
        modeKey={modeKey}
        onModeChange={setModeKey}
        games={games}
        modes={modes}
        league={league}
        isModeAvailable={isModeAvailable}
        disabled={formDisabled}
      />
    );
  } else if (stage === 'mode') {
    content = (
      <ModeStage
        session={session}
        activeModeStep={activeModeStep}
        onChoiceChange={handleChoiceChange}
        sessionUpdating={sessionUpdating}
      />
    );
  } else if (stage === 'general') {
    content = (
      <GeneralStage
        league={league}
        generalSchema={generalSchema}
        effectiveGeneralSchema={effectiveGeneralSchema}
        generalValues={generalValues}
        onGeneralValuesChange={setGeneralValues}
        disabled={generalSaving}
      />
    );
  } else {
    content = (
      <SummaryStage
        league={league}
        session={session}
        generalValues={generalValues}
        u2pickCondition={u2pickCondition}
        u2pickOptions={u2pickOptions}
        u2pickValidation={u2pickValidation}
      />
    );
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
