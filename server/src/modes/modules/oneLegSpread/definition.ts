import type { ModeModule } from '../../shared/types';
import { oneLegSpreadValidator } from './validator';

export const oneLegSpreadModule: ModeModule = {
  definition: {
    key: 'one_leg_spread',
    label: '1 Leg Spread',
    summaryTemplate: '`1 Leg Spread`',
    descriptionTemplate: '`Absolute final score difference bucket`',
    secondaryDescriptionTemplate: '`Predict the final point spread bucket`',
    winningConditionTemplate: '`Winning choice is the inclusive bucket that contains the absolute final score differential`',
    optionsExpression: "['pass','0-3','4-10','11-25','26+']",
    configSteps: [],
  },
  validator: oneLegSpreadValidator,
};
