import type { ModeContext, LeagueModeModule } from '../../../types';
import { nbaScoreSorcererOverview } from './overview';
import { prepareNbaScoreSorcererConfig } from './prepareConfig';
import { nbaScoreSorcererValidator } from './validator';
import { getNbaScoreSorcererLiveInfo } from './liveInfo';
import { buildNbaScoreSorcererUserConfig } from './userConfig';
import {
  NBA_SCORE_SORCERER_BASELINE_EVENT,
  NBA_SCORE_SORCERER_LABEL,
  NBA_SCORE_SORCERER_MODE_KEY,
  NBA_SCORE_SORCERER_NO_MORE_SCORES,
  NBA_SCORE_SORCERER_RESULT_EVENT,
} from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe mode functions
// ─────────────────────────────────────────────────────────────────────────────

function computeWinningCondition(): string {
  return 'Next team to score';
}

function computeOptions({ config }: ModeContext): string[] {
  const home = config.home_team_name || config.home_team_abbrev || config.home_team_id || 'Home Team';
  const away = config.away_team_name || config.away_team_abbrev || config.away_team_id || 'Away Team';
  return ['pass', String(home), String(away), NBA_SCORE_SORCERER_NO_MORE_SCORES];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module definition
// ─────────────────────────────────────────────────────────────────────────────

export const nbaScoreSorcererModule: LeagueModeModule = {
  key: NBA_SCORE_SORCERER_MODE_KEY,
  label: NBA_SCORE_SORCERER_LABEL,
  supportedLeagues: ['NBA'],
  definition: {
    key: NBA_SCORE_SORCERER_MODE_KEY,
    label: NBA_SCORE_SORCERER_LABEL,
    computeWinningCondition,
    computeOptions,
    configSteps: [],
    metadata: {
      baselineEvent: NBA_SCORE_SORCERER_BASELINE_EVENT,
      resultEvent: NBA_SCORE_SORCERER_RESULT_EVENT,
    },
  },
  overview: nbaScoreSorcererOverview,
  prepareConfig: async ({ bet, config }) => prepareNbaScoreSorcererConfig({ bet, config }),
  validator: nbaScoreSorcererValidator,
  buildUserConfig: buildNbaScoreSorcererUserConfig,
  getLiveInfo: getNbaScoreSorcererLiveInfo,
};
