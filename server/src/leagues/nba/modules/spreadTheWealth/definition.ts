/**
 * NBA Spread The Wealth Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createSpreadTheWealthModule } from '../../../sharedUtils/modeFactories/spreadTheWealthFactory';
import {
  NBA_SPREAD_THE_WEALTH_LABEL,
  NBA_SPREAD_THE_WEALTH_MODE_KEY,
  SPREAD_MIN,
  SPREAD_MAX,
  SPREAD_STEP,
} from './constants';
import { prepareNbaSpreadTheWealthConfig } from './prepareConfig';
import { nbaSpreadTheWealthValidator } from './validator';
import { buildNbaSpreadTheWealthUserConfig } from './userConfig';
import { nbaSpreadTheWealthOverview } from './overview';
import { getNbaSpreadTheWealthLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const nbaSpreadTheWealthModule = createSpreadTheWealthModule(
  {
    league: 'NBA',
    modeKey: NBA_SPREAD_THE_WEALTH_MODE_KEY,
    modeLabel: NBA_SPREAD_THE_WEALTH_LABEL,
    spreadRange: {
      min: SPREAD_MIN,
      max: SPREAD_MAX,
      step: SPREAD_STEP,
    },
    requiresResolveAt: false,
  },
  {
    overview: nbaSpreadTheWealthOverview,
    validator: nbaSpreadTheWealthValidator,
    buildUserConfig: buildNbaSpreadTheWealthUserConfig,
    getLiveInfo: getNbaSpreadTheWealthLiveInfo,
    prepareConfig: prepareNbaSpreadTheWealthConfig,
  },
);
