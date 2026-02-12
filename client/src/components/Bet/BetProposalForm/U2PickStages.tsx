import React from 'react';
import { XIcon } from '@shared/widgets/icons/XIcon';
import { PlusIcon } from '@shared/widgets/icons/PlusIcon';

interface U2PickValidation {
  conditionMin: number;
  conditionMax: number;
  optionMin: number;
  optionMax: number;
  optionsMinCount: number;
  optionsMaxCount: number;
}

/* ---------- Condition Stage ---------- */

interface U2PickConditionStageProps {
  condition: string;
  onConditionChange: (value: string) => void;
  validation: U2PickValidation;
}

export const U2PickConditionStage: React.FC<U2PickConditionStageProps> = ({
  condition,
  onConditionChange,
  validation,
}) => (
  <div className="form-step">
    <div className="form-group">
      <label className="form-label" htmlFor="u2pick-condition">
        Winning Condition
      </label>
      <input
        id="u2pick-condition"
        type="text"
        className="form-input"
        placeholder="e.g. first to score"
        value={condition}
        onChange={(e) => onConditionChange(e.target.value)}
        minLength={validation.conditionMin}
        maxLength={validation.conditionMax}
      />
      <div className="form-helper-text">
        {condition.trim().length}/{validation.conditionMax} characters
        {condition.trim().length < validation.conditionMin && (
          <span> (min {validation.conditionMin})</span>
        )}
      </div>
    </div>
  </div>
);

/* ---------- Options Stage ---------- */

interface U2PickOptionsStageProps {
  options: string[];
  onOptionsChange: React.Dispatch<React.SetStateAction<string[]>>;
  validation: U2PickValidation;
}

export const U2PickOptionsStage: React.FC<U2PickOptionsStageProps> = ({
  options,
  onOptionsChange,
  validation,
}) => {
  const handleOptionChange = (index: number, value: string) => {
    onOptionsChange((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAdd = () => {
    if (options.length >= validation.optionsMaxCount) return;
    onOptionsChange((prev) => [...prev, '']);
  };

  const handleRemove = (index: number) => {
    if (options.length <= validation.optionsMinCount) return;
    onOptionsChange((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="form-step">
      <div className="form-group">
        <label className="form-label">
          Options ({validation.optionsMinCount}-{validation.optionsMaxCount})
        </label>
        {options.map((option, index) => (
          <div key={index} className="u2pick-option-row">
            <input
              type="text"
              className="form-input"
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(e) => handleOptionChange(index, e.target.value)}
              minLength={validation.optionMin}
              maxLength={validation.optionMax}
            />
            {options.length > validation.optionsMinCount && (
              <button
                type="button"
                className="u2pick-option-remove"
                onClick={() => handleRemove(index)}
                aria-label={`Remove option ${index + 1}`}
              >
                <XIcon />
              </button>
            )}
          </div>
        ))}
        {options.length < validation.optionsMaxCount && (
          <button type="button" className="u2pick-add-option" onClick={handleAdd}>
            <PlusIcon /> Add Option
          </button>
        )}
      </div>
    </div>
  );
};
