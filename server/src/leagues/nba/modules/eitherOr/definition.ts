/**
 * NBA Either/Or Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createEitherOrModule } from '../../../sharedUtils/modeFactories/eitherOrFactory';
import { ALLOWED_RESOLVE_AT, NBA_STAT_KEY_LABELS, NBA_STAT_KEY_TO_CATEGORY } from '../../utils/statConstants';
import { NBA_EITHER_OR_MODE_KEY, NBA_EITHER_OR_LABEL } from './constants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';
import { eitherOrOverview } from './overview';
import { getEitherOrLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const nbaEitherOrModule = createEitherOrModule(
  {
    league: 'NBA',
    modeKey: NBA_EITHER_OR_MODE_KEY,
    modeLabel: NBA_EITHER_OR_LABEL,
    statKeyToCategory: NBA_STAT_KEY_TO_CATEGORY,
    statKeyLabels: NBA_STAT_KEY_LABELS,
    allowedResolveAt: ALLOWED_RESOLVE_AT,
  },
  {
    overview: eitherOrOverview,
    validator: eitherOrValidator,
    buildUserConfig: buildEitherOrUserConfig,
    getLiveInfo: getEitherOrLiveInfo,
    prepareConfig: prepareEitherOrConfig,
    buildMetadata: buildEitherOrMetadata,
  },
);
