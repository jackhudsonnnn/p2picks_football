import type { ModeModule } from '../../shared/types';
import { chooseTheirFateValidator } from './validator';
import { prepareChooseTheirFateConfig } from './prepareConfig';

export const chooseTheirFateModule: ModeModule = {
  definition: {
    key: 'choose_their_fate',
    label: 'Choose Their Fate',
    summaryTemplate: '`Choose Their Fate`',
    descriptionTemplate:
      '`${(config.possession_team_name || config.possession_team_id || "Offense")}\'s ball`',
    secondaryDescriptionTemplate: '`Outcome of current posession`',
    winningConditionTemplate:
      '`Offensive drive result in the ${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")} game`',
    optionsExpression: "['pass','Touchdown','Field Goal','Safety','Turnover']",
    configSteps: [],
  },
  prepareConfig: prepareChooseTheirFateConfig,
  validator: chooseTheirFateValidator,
};
