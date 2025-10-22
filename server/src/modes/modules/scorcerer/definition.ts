import type { ModeModule } from '../../shared/types';
import { scorcererValidator } from './validator';
import { prepareScorcererConfig } from './prepareConfig';
import { scorcererOverview } from './overview';

export const scorcererModule: ModeModule = {
  definition: {
    key: 'scorcerer',
    label: 'Scorcerer',
    summaryTemplate: 'Scorcerer',
    descriptionTemplate: 
        '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate: '`TD • FG • Safety • No More Scores`',
    winningConditionTemplate:
      '`Predict the next score type`',
    optionsExpression: "['pass','Touchdown','Field Goal','Safety','No More Scores']",
    configSteps: [],
  },
  overview: scorcererOverview,
  prepareConfig: prepareScorcererConfig,
  validator: scorcererValidator,
};
