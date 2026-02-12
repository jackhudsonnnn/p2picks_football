/**
 * NBA King of the Hill Mode Definition
 *
 * Uses the shared factory to create the mode module.
 */

import { createKingOfTheHillModule } from '../../../sharedUtils/modeFactories/kingOfTheHillFactory';
import {
  NBA_KOTH_ALLOWED_RESOLVE_VALUES,
  NBA_KOTH_DEFAULT_RESOLVE_VALUE,
  NBA_KOTH_LABEL,
  NBA_KOTH_MODE_KEY,
  NBA_KOTH_STAT_KEY_LABELS,
  NBA_KOTH_STAT_KEY_TO_CATEGORY,
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
    league: 'NBA',
    modeKey: NBA_KOTH_MODE_KEY,
    modeLabel: NBA_KOTH_LABEL,
    statKeyToCategory: NBA_KOTH_STAT_KEY_TO_CATEGORY,
    statKeyLabels: NBA_KOTH_STAT_KEY_LABELS,
    allowedResolveValues: NBA_KOTH_ALLOWED_RESOLVE_VALUES,
    defaultResolveValue: NBA_KOTH_DEFAULT_RESOLVE_VALUE,
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
