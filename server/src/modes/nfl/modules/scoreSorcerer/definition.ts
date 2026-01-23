import type { ModeContext, LeagueModeModule } from '../../../types';
import { scoreSorcererOverview } from './overview';
import { prepareScoreSorcererConfig } from './prepareConfig';
import { scoreSorcererValidator } from './validator';
import { getScoreSorcererLiveInfo } from './liveInfo';
import { buildScoreSorcererUserConfig } from './userConfig';
import {
  SCORE_SORCERER_BASELINE_EVENT,
  SCORE_SORCERER_LABEL,
  SCORE_SORCERER_MODE_KEY,
  SCORE_SORCERER_NO_MORE_SCORES,
  SCORE_SORCERER_RESULT_EVENT,
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
  return ['pass', String(home), String(away), SCORE_SORCERER_NO_MORE_SCORES];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module definition
// ─────────────────────────────────────────────────────────────────────────────

export const scoreSorcererModule: LeagueModeModule = {
  key: SCORE_SORCERER_MODE_KEY,
  label: SCORE_SORCERER_LABEL,
  supportedLeagues: ['NFL'],
  definition: {
    key: SCORE_SORCERER_MODE_KEY,
    label: SCORE_SORCERER_LABEL,
    computeWinningCondition,
    computeOptions,
    configSteps: [],
    metadata: {
      baselineEvent: SCORE_SORCERER_BASELINE_EVENT,
      resultEvent: SCORE_SORCERER_RESULT_EVENT,
    },
  },
  overview: scoreSorcererOverview,
  prepareConfig: async ({ bet, config }) => prepareScoreSorcererConfig({ bet, config }),
  validator: scoreSorcererValidator,
  buildUserConfig: buildScoreSorcererUserConfig,
  getLiveInfo: getScoreSorcererLiveInfo,
};
