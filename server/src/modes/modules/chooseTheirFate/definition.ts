import type { ModeModule } from '../../shared/types';
import { chooseTheirFateValidator } from './validator';

export const chooseTheirFateModule: ModeModule = {
  definition: {
    key: 'choose_their_fate',
    label: 'Choose Their Fate',
    summaryTemplate: '`Choose Their Fate`',
    descriptionTemplate: '`Predict the current drive outcome`',
    secondaryDescriptionTemplate: '`Touchdown • Field Goal • Safety • Turnover`',
    winningConditionTemplate: '`Actual drive result`',
    optionsExpression: "['pass','Touchdown','Field Goal','Safety','Turnover']",
    configSteps: [],
  },
  validator: chooseTheirFateValidator,
};
