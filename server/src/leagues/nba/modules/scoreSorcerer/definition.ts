/**
 * NBA Score Sorcerer Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createScoreSorcererModule } from '../../../sharedUtils/modeFactories/scoreSorcererFactory';
import {
  NBA_SCORE_SORCERER_BASELINE_EVENT,
  NBA_SCORE_SORCERER_LABEL,
  NBA_SCORE_SORCERER_MODE_KEY,
  NBA_SCORE_SORCERER_NO_MORE_SCORES,
  NBA_SCORE_SORCERER_RESULT_EVENT,
} from './constants';
import { nbaScoreSorcererOverview } from './overview';
import { prepareNbaScoreSorcererConfig } from './prepareConfig';
import { nbaScoreSorcererValidator } from './validator';
import { buildNbaScoreSorcererUserConfig } from './userConfig';
import { getNbaScoreSorcererLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const nbaScoreSorcererModule = createScoreSorcererModule(
  {
    league: 'NBA',
    modeKey: NBA_SCORE_SORCERER_MODE_KEY,
    modeLabel: NBA_SCORE_SORCERER_LABEL,
    noMoreScoresLabel: NBA_SCORE_SORCERER_NO_MORE_SCORES,
    baselineEvent: NBA_SCORE_SORCERER_BASELINE_EVENT,
    resultEvent: NBA_SCORE_SORCERER_RESULT_EVENT,
  },
  {
    overview: nbaScoreSorcererOverview,
    validator: nbaScoreSorcererValidator,
    buildUserConfig: buildNbaScoreSorcererUserConfig,
    getLiveInfo: getNbaScoreSorcererLiveInfo,
    prepareConfig: prepareNbaScoreSorcererConfig,
  },
);
