import type { ModeModule } from '../../shared/types';
import { differenceInOpinionValidator } from './validator';

export const differenceInOpinionModule: ModeModule = {
  definition: {
    key: 'difference_in_opinion',
    label: 'Difference In Opinion',
    summaryTemplate: '`Difference In Opinion`',
    descriptionTemplate: '`Absolute final score difference bucket`',
    secondaryDescriptionTemplate: '`Predict the final point spread bucket`',
    winningConditionTemplate: '`Winning choice is the inclusive bucket that contains the absolute final score differential`',
    optionsExpression: "['pass','0-3','4-10','11-25','26+']",
    configSteps: [],
  },
  validator: differenceInOpinionValidator,
};
