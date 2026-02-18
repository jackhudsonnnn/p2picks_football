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

  const choices = step.choices ?? [];
  const hasChoices = choices.length > 0;

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
          disabled={sessionUpdating || !hasChoices}
          onChange={(e) => onChoiceChange(step.key, e.target.value)}
        >
          <option value="">{hasChoices ? 'Select option' : 'No options available'}</option>
          {choices.map((choice, idx) => {
            const key = choice.id ?? choice.value ?? choice.label ?? String(idx);
            return (
              <option key={key} value={choice.id ?? choice.value ?? ''} disabled={choice.disabled}>
                {choice.label}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
};
