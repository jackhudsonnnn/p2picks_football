/**
 * NBA Prop Hunt Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createPropHuntModule } from '../../../sharedUtils/modeFactories/propHuntFactory';
import { nbaPropHuntOverview } from './overview';
import { buildNbaPropHuntUserConfig } from './userConfig';
import { prepareNbaPropHuntConfig } from './prepareConfig';
import { nbaPropHuntValidator } from './validator';
import { getNbaPropHuntLiveInfo } from './liveInfo';
import {
  NBA_PROP_HUNT_ALLOWED_RESOLVE_AT,
  NBA_PROP_HUNT_DEFAULT_RESOLVE_AT,
  NBA_PROP_HUNT_LINE_RANGE,
  NBA_PROP_HUNT_MODE_KEY,
  NBA_PROP_HUNT_LABEL,
  NBA_PROP_HUNT_STAT_KEY_LABELS,
  NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY,
} from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const nbaPropHuntModule = createPropHuntModule(
  {
    league: 'NBA',
    modeKey: NBA_PROP_HUNT_MODE_KEY,
    modeLabel: NBA_PROP_HUNT_LABEL,
    statKeyLabels: NBA_PROP_HUNT_STAT_KEY_LABELS,
    statKeyToCategory: NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY,
    allowedResolveAt: NBA_PROP_HUNT_ALLOWED_RESOLVE_AT,
    defaultResolveAt: NBA_PROP_HUNT_DEFAULT_RESOLVE_AT,
    lineRange: NBA_PROP_HUNT_LINE_RANGE,
  },
  {
    overview: nbaPropHuntOverview,
    validator: nbaPropHuntValidator,
    buildUserConfig: buildNbaPropHuntUserConfig,
    getLiveInfo: getNbaPropHuntLiveInfo,
    prepareConfig: prepareNbaPropHuntConfig,
  },
);
