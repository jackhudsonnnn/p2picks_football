import type { ModeModule } from '../../shared/types';
import { scorcererValidator } from './validator';
import { prepareScorcererConfig } from './prepareConfig';

export const scorcererModule: ModeModule = {
  definition: {
    key: 'scorcerer',
    label: 'Scorcerer',
    summaryTemplate: '`Scorcerer`',
    descriptionTemplate: '`What will it be?`',
    secondaryDescriptionTemplate: '`TD • FG • Safety • No More Scores`',
    winningConditionTemplate:
      '`Predict the next score type in the ${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")} game`',
    optionsExpression: "['pass','TD','FG','Safety','No More Scores']",
    configSteps: [],
  },
  prepareConfig: prepareScorcererConfig,
  validator: scorcererValidator,
};
