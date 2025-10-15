import type { ModeModule } from '../../shared/types';
import { differenceInOpinionValidator } from './validator';
import { prepareDifferenceInOpinionConfig } from './prepareConfig';

export const differenceInOpinionModule: ModeModule = {
  definition: {
    key: 'difference_in_opinion',
    label: 'Difference In Opinion',
    summaryTemplate: '`Difference In Opinion`',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate: '`Predict the final point spread bucket`',
    winningConditionTemplate:
      '`Absolute score difference between ${(config.home_team_name || config.home_team_id || "Home Team")} and ${(config.away_team_name || config.away_team_id || "Away Team")} in the ${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")} game`',
    optionsExpression: "['pass','0-3','4-10','11-25','26+']",
    configSteps: [],
  },
  prepareConfig: prepareDifferenceInOpinionConfig,
  validator: differenceInOpinionValidator,
};
