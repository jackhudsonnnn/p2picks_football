/**
 * NFL Either/Or Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createEitherOrModule } from '../../../sharedUtils/modeFactories/eitherOrFactory';
import { ALLOWED_RESOLVE_AT, STAT_KEY_TO_CATEGORY, STAT_KEY_LABELS } from '../../utils/statConstants';
import {
  EITHER_OR_MODE_KEY,
  EITHER_OR_LABEL,
} from './constants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';
import { eitherOrOverview } from './overview';
import { getEitherOrLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const eitherOrModule = createEitherOrModule(
  {
    league: 'NFL',
    modeKey: EITHER_OR_MODE_KEY,
    modeLabel: EITHER_OR_LABEL,
    statKeyToCategory: STAT_KEY_TO_CATEGORY,
    statKeyLabels: STAT_KEY_LABELS,
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
