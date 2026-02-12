/**
 * NFL Spread The Wealth Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createSpreadTheWealthModule } from '../../../sharedUtils/modeFactories/spreadTheWealthFactory';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import {
  SPREAD_MODE_KEY,
  SPREAD_LABEL,
  SPREAD_MIN,
  SPREAD_MAX,
  STEP,
} from './constants';
import { prepareSpreadTheWealthConfig } from './prepareConfig';
import { spreadTheWealthValidator } from './validator';
import { buildSpreadTheWealthUserConfig } from './userConfig';
import { spreadTheWealthOverview } from './overview';
import { getSpreadTheWealthLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const spreadTheWealthModule = createSpreadTheWealthModule(
  {
    league: 'NFL',
    modeKey: SPREAD_MODE_KEY,
    modeLabel: SPREAD_LABEL,
    spreadRange: {
      min: SPREAD_MIN,
      max: SPREAD_MAX,
      step: STEP,
    },
    allowedResolveAt: ALLOWED_RESOLVE_AT,
    defaultResolveAt: DEFAULT_RESOLVE_AT,
    requiresResolveAt: true,
  },
  {
    overview: spreadTheWealthOverview,
    validator: spreadTheWealthValidator,
    buildUserConfig: buildSpreadTheWealthUserConfig,
    getLiveInfo: getSpreadTheWealthLiveInfo,
    prepareConfig: prepareSpreadTheWealthConfig,
  },
);
