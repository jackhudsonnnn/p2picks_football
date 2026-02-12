import React from 'react';
import { formatToHundredth } from '@shared/utils/number';
import type { BetConfigSession } from '@features/bets/service';

interface U2PickValidation {
  optionMin: number;
}

interface GeneralValues {
  wager_amount: string;
  time_limit_seconds: string;
}

interface SummaryStageProps {
  league: string;
  session: BetConfigSession | null;
  generalValues: GeneralValues;
  u2pickCondition: string;
  u2pickOptions: string[];
  u2pickValidation: U2PickValidation;
}

export const SummaryStage: React.FC<SummaryStageProps> = ({
  league,
  session,
  generalValues,
  u2pickCondition,
  u2pickOptions,
  u2pickValidation,
}) => {
  if (league === 'U2Pick') {
    const validOptions = u2pickOptions
      .map((o) => o.trim())
      .filter((o) => o.length >= u2pickValidation.optionMin);

    return (
      <div className="form-step centered-step">
        <div className="summary-header">
          <strong>U2Pick • Table Talk</strong>
        </div>
        <div>
          ${formatToHundredth(Number(generalValues.wager_amount))} •{' '}
          {generalValues.time_limit_seconds}s window
        </div>
        <div>{u2pickCondition.trim()}</div>
        <div className="u2pick-summary-options">
          {validOptions.map((opt) => (
            <span key={opt} className="u2pick-summary-option">
              {opt}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return <div className="form-step centered-step">Configuration session missing.</div>;
  }
  if (!session.preview) {
    return (
      <div className="form-step centered-step">
        Preview unavailable. Adjust selections or go back.
      </div>
    );
  }

  return (
    <div className="form-step centered-step">
      <div className="summary-header">
        <strong>
          {session.league} • {session.preview.modeLabel ?? session.mode_key}
        </strong>
      </div>
      <div>
        ${formatToHundredth(session.general.wager_amount)} •{' '}
        {session.general.time_limit_seconds}s window
      </div>
      <div>{session.preview.description}</div>
      <div>{session.preview.summary}</div>
      {session.preview.winningCondition && <div>{session.preview.winningCondition}</div>}
    </div>
  );
};
