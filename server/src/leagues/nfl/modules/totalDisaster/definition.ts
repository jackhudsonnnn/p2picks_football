/**
 * NFL Total Disaster Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createTotalDisasterModule } from '../../../sharedUtils/modeFactories/totalDisasterFactory';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { prepareTotalDisasterConfig } from './prepareConfig';
import { totalDisasterValidator } from './validator';
import { buildTotalDisasterUserConfig } from './userConfig';
import { totalDisasterOverview } from './overview';
import { getTotalDisasterLiveInfo } from './liveInfo';
import { TOTAL_DISASTER_MODE_KEY, TOTAL_DISASTER_LABEL, LINE_MIN, LINE_MAX, LINE_STEP } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const totalDisasterModule = createTotalDisasterModule(
  {
    league: 'NFL',
    modeKey: TOTAL_DISASTER_MODE_KEY,
    modeLabel: TOTAL_DISASTER_LABEL,
    allowedResolveAt: ALLOWED_RESOLVE_AT,
    defaultResolveAt: DEFAULT_RESOLVE_AT,
    lineValidation: {
      min: LINE_MIN,
      max: LINE_MAX,
      step: LINE_STEP,
    },
  },
  {
    overview: totalDisasterOverview,
    validator: totalDisasterValidator,
    buildUserConfig: buildTotalDisasterUserConfig,
    getLiveInfo: getTotalDisasterLiveInfo,
    prepareConfig: prepareTotalDisasterConfig,
  },
);
