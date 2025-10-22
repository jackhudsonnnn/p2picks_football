import type { ModeModule } from '../../shared/types';
import { chooseTheirFateValidator } from './validator';
import { prepareChooseTheirFateConfig } from './prepareConfig';
import { chooseTheirFateOverview } from './overview';

export const chooseTheirFateModule: ModeModule = {
  definition: {
    key: 'choose_their_fate',
    label: 'Choose Their Fate',
    summaryTemplate: 'Choose Their Fate',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate: '`Outcome of current posession`',
    winningConditionTemplate:
      '`${(config.possession_team_name || config.possession_team_id || "Offense")}\'s drive outcome`',
    optionsExpression: "['pass','Touchdown','Field Goal','Safety','Turnover']",
    configSteps: [],
  },
  overview: chooseTheirFateOverview,
  prepareConfig: prepareChooseTheirFateConfig,
  validator: chooseTheirFateValidator,
};
