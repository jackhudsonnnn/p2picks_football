import type { ModeContext, LeagueModeModule } from '../../../types';
import {
  NBA_SPREAD_THE_WEALTH_LABEL,
  NBA_SPREAD_THE_WEALTH_MODE_KEY,
} from './constants';
import { prepareNbaSpreadTheWealthConfig } from './prepareConfig';
import { nbaSpreadTheWealthValidator } from './validator';
import { buildNbaSpreadTheWealthUserConfig } from './userConfig';
import { nbaSpreadTheWealthOverview } from './overview';
import { getNbaSpreadTheWealthLiveInfo } from './liveInfo';
import { describeSpread, normalizeSpread } from './evaluator';

function computeWinningCondition({ config }: ModeContext): string {
  const spread = describeSpread(config) ?? 'spread';
  return `Beat the spread: ${spread}`;
}

function computeOptions({ config }: ModeContext): string[] {
  const spread = normalizeSpread(config as any);
  const allowsTie = spread != null && Number.isInteger(spread);
  const opts = allowsTie ? ['No Entry', 'Over', 'Under', 'Tie'] : ['No Entry', 'Home', 'Away'];
  return opts;
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  const spread = normalizeSpread(config as any);
  if (spread == null) errors.push('Spread required');
  return errors;
}

export const spreadTheWealthNbaModule: LeagueModeModule = {
  key: NBA_SPREAD_THE_WEALTH_MODE_KEY,
  label: NBA_SPREAD_THE_WEALTH_LABEL,
  supportedLeagues: ['NBA'],
  definition: {
    key: NBA_SPREAD_THE_WEALTH_MODE_KEY,
    label: NBA_SPREAD_THE_WEALTH_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [
      { key: 'spread', component: 'spreadTheWealth.spread', label: 'Select Spread' },
      { key: 'resolve_at', component: 'spreadTheWealth.resolve', label: 'Resolve At' },
    ],
    metadata: {},
  },
  overview: nbaSpreadTheWealthOverview,
  prepareConfig: async ({ bet, config }) =>
    prepareNbaSpreadTheWealthConfig({ bet, config, league: (bet.league as any) ?? 'NBA' }),
  validator: nbaSpreadTheWealthValidator,
  buildUserConfig: buildNbaSpreadTheWealthUserConfig,
  getLiveInfo: getNbaSpreadTheWealthLiveInfo,
};
