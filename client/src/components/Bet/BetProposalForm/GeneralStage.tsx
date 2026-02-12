import React from 'react';
import { formatToHundredth } from '@shared/utils/number';
import type { BetGeneralConfigSchema } from '@features/bets/service';
import type { League } from '@shared/types/bet';

interface GeneralValues {
  wager_amount: string;
  time_limit_seconds: string;
}

interface GeneralStageProps {
  league: League;
  generalSchema: BetGeneralConfigSchema | null;
  effectiveGeneralSchema: BetGeneralConfigSchema | null;
  generalValues: GeneralValues;
  onGeneralValuesChange: React.Dispatch<React.SetStateAction<GeneralValues>>;
  disabled?: boolean;
}

export const GeneralStage: React.FC<GeneralStageProps> = ({
  league,
  generalSchema,
  effectiveGeneralSchema,
  generalValues,
  onGeneralValuesChange,
  disabled,
}) => {
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
          onChange={(e) =>
            onGeneralValuesChange((prev) => ({ ...prev, wager_amount: e.target.value }))
          }
          disabled={disabled}
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
          onChange={(e) =>
            onGeneralValuesChange((prev) => ({ ...prev, time_limit_seconds: e.target.value }))
          }
          disabled={disabled}
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
