import type { ModeModule } from '../../shared/types';
import { scoreSorcererOverview } from './overview';
import { prepareScoreSorcererConfig } from './prepareConfig';
import { scoreSorcererValidator } from './validator';
import { getScoreSorcererLiveInfo } from './liveInfo';
import {
  SCORE_SORCERER_BASELINE_EVENT,
  SCORE_SORCERER_LABEL,
  SCORE_SORCERER_MODE_KEY,
  SCORE_SORCERER_NO_MORE_SCORES,
  SCORE_SORCERER_RESULT_EVENT,
} from './constants';

export const scoreSorcererModule: ModeModule = {
  definition: {
    key: SCORE_SORCERER_MODE_KEY,
    label: SCORE_SORCERER_LABEL,
    summaryTemplate:
      'Score Sorcerer',
    matchupTemplate:
      '`${(config.home_team_name || "Home Team")} vs ${(config.away_team_name || "Away Team")}`',
    winningConditionTemplate:
      '`Next team to score`',
    optionsExpression:
      '(() => { const home = config.home_team_name || config.home_team_abbrev || config.home_team_id || "Home Team"; const away = config.away_team_name || config.away_team_abbrev || config.away_team_id || "Away Team"; return ["pass", home, away, "' +
      SCORE_SORCERER_NO_MORE_SCORES +
      '"]; })()',
    configSteps: [],
    metadata: {
      baselineEvent: SCORE_SORCERER_BASELINE_EVENT,
      resultEvent: SCORE_SORCERER_RESULT_EVENT,
    },
  },
  overview: scoreSorcererOverview,
  prepareConfig: prepareScoreSorcererConfig,
  validator: scoreSorcererValidator,
  getLiveInfo: getScoreSorcererLiveInfo,
};
