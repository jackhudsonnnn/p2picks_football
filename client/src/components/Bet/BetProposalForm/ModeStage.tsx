import React from 'react';
import type { BetModeUserConfigStep } from '@features/bets/service';

interface ModeStageProps {
  session: { steps: BetModeUserConfigStep[] } | null;
  activeModeStep: BetModeUserConfigStep | null;
  onChoiceChange: (stepKey: string, choiceId: string) => void;
  sessionUpdating?: boolean;
}

export const ModeStage: React.FC<ModeStageProps> = ({
  session,
  activeModeStep,
  onChoiceChange,
  sessionUpdating,
}) => {
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
          onChange={(e) => onChoiceChange(step.key, e.target.value)}
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
