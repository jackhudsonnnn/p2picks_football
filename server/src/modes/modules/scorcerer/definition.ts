import type { ModeModule } from '../../shared/types';
import { scorcererValidator } from './validator';

export const scorcererModule: ModeModule = {
  definition: {
    key: 'scorcerer',
    label: 'Scorcerer',
    summaryTemplate: '`Scorcerer`',
    descriptionTemplate: '`Predict the next score type`',
    secondaryDescriptionTemplate: '`TD • FG • Safety • No More Scores`',
    winningConditionTemplate: '`Actual next scoring play type`',
    optionsExpression: "['pass','TD','FG','Safety','No More Scores']",
    configSteps: [],
  },
  validator: scorcererValidator,
};
