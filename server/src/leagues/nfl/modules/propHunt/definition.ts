/**
 * NFL Prop Hunt Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createPropHuntModule } from '../../../sharedUtils/modeFactories/propHuntFactory';
import { propHuntOverview } from './overview';
import { buildPropHuntUserConfig } from './userConfig';
import { preparePropHuntConfig } from './prepareConfig';
import { propHuntValidator } from './validator';
import {
  PROP_HUNT_ALLOWED_RESOLVE_AT,
  PROP_HUNT_DEFAULT_RESOLVE_AT,
  PROP_HUNT_LINE_RANGE,
  STAT_KEY_LABELS,
  PROP_HUNT_MODE_KEY,
  PROP_HUNT_LABEL,
} from './constants';
import { getPropHuntLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const propHuntModule = createPropHuntModule(
  {
    league: 'NFL',
    modeKey: PROP_HUNT_MODE_KEY,
    modeLabel: PROP_HUNT_LABEL,
    statKeyLabels: STAT_KEY_LABELS,
    allowedResolveAt: PROP_HUNT_ALLOWED_RESOLVE_AT,
    defaultResolveAt: PROP_HUNT_DEFAULT_RESOLVE_AT,
    lineRange: PROP_HUNT_LINE_RANGE,
  },
  {
    overview: propHuntOverview,
    validator: propHuntValidator,
    buildUserConfig: buildPropHuntUserConfig,
    getLiveInfo: getPropHuntLiveInfo,
    prepareConfig: preparePropHuntConfig,
  },
);
