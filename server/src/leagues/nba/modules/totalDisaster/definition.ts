/**
 * NBA Total Disaster Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createTotalDisasterModule } from '../../../sharedUtils/modeFactories/totalDisasterFactory';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { prepareNbaTotalDisasterConfig } from './prepareConfig';
import { nbaTotalDisasterValidator } from './validator';
import { buildNbaTotalDisasterUserConfig } from './userConfig';
import { nbaTotalDisasterOverview } from './overview';
import { getNbaTotalDisasterLiveInfo } from './liveInfo';
import {
  NBA_TOTAL_DISASTER_LABEL,
  NBA_TOTAL_DISASTER_MODE_KEY,
  LINE_MIN,
  LINE_MAX,
  LINE_STEP,
} from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const nbaTotalDisasterModule = createTotalDisasterModule(
  {
    league: 'NBA',
    modeKey: NBA_TOTAL_DISASTER_MODE_KEY,
    modeLabel: NBA_TOTAL_DISASTER_LABEL,
    allowedResolveAt: ALLOWED_RESOLVE_AT,
    defaultResolveAt: DEFAULT_RESOLVE_AT,
    lineValidation: {
      min: LINE_MIN,
      max: LINE_MAX,
      step: LINE_STEP,
    },
  },
  {
    overview: nbaTotalDisasterOverview,
    validator: nbaTotalDisasterValidator,
    buildUserConfig: buildNbaTotalDisasterUserConfig,
    getLiveInfo: getNbaTotalDisasterLiveInfo,
    prepareConfig: prepareNbaTotalDisasterConfig,
  },
);
