/**
 * NFL Score Sorcerer Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createScoreSorcererModule } from '../../../sharedUtils/modeFactories/scoreSorcererFactory';
import {
  SCORE_SORCERER_BASELINE_EVENT,
  SCORE_SORCERER_LABEL,
  SCORE_SORCERER_MODE_KEY,
  SCORE_SORCERER_NO_MORE_SCORES,
  SCORE_SORCERER_RESULT_EVENT,
} from './constants';
import { scoreSorcererOverview } from './overview';
import { prepareScoreSorcererConfig } from './prepareConfig';
import { scoreSorcererValidator } from './validator';
import { buildScoreSorcererUserConfig } from './userConfig';
import { getScoreSorcererLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const scoreSorcererModule = createScoreSorcererModule(
  {
    league: 'NFL',
    modeKey: SCORE_SORCERER_MODE_KEY,
    modeLabel: SCORE_SORCERER_LABEL,
    noMoreScoresLabel: SCORE_SORCERER_NO_MORE_SCORES,
    baselineEvent: SCORE_SORCERER_BASELINE_EVENT,
    resultEvent: SCORE_SORCERER_RESULT_EVENT,
  },
  {
    overview: scoreSorcererOverview,
    validator: scoreSorcererValidator,
    buildUserConfig: buildScoreSorcererUserConfig,
    getLiveInfo: getScoreSorcererLiveInfo,
    prepareConfig: prepareScoreSorcererConfig,
  },
);
