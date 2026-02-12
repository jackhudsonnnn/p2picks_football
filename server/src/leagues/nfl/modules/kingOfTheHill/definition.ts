/**
 * NFL King of the Hill Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createKingOfTheHillModule } from '../../../sharedUtils/modeFactories/kingOfTheHillFactory';
import {
  KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
  KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
  KING_OF_THE_HILL_MODE_KEY,
  KING_OF_THE_HILL_LABEL,
} from './constants';
import { buildKingOfTheHillMetadata, prepareKingOfTheHillConfig } from './prepareConfig';
import { kingOfTheHillValidator } from './validator';
import { buildKingOfTheHillUserConfig } from './userConfig';
import { kingOfTheHillOverview } from './overview';
import { getKingOfTheHillLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Module definition using factory
// ─────────────────────────────────────────────────────────────────────────────

export const kingOfTheHillModule = createKingOfTheHillModule(
  {
    league: 'NFL',
    modeKey: KING_OF_THE_HILL_MODE_KEY,
    modeLabel: KING_OF_THE_HILL_LABEL,
    statKeyToCategory: KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
    statKeyLabels: KING_OF_THE_HILL_STAT_KEY_LABELS,
    allowedResolveValues: KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
    defaultResolveValue: KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  },
  {
    overview: kingOfTheHillOverview,
    validator: kingOfTheHillValidator,
    buildUserConfig: buildKingOfTheHillUserConfig,
    getLiveInfo: getKingOfTheHillLiveInfo,
    prepareConfig: prepareKingOfTheHillConfig,
    buildMetadata: buildKingOfTheHillMetadata,
  },
);
