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
  const home = (config as any).home_team_name || (config as any).home_team_id || 'Home Team';
  const away = (config as any).away_team_name || (config as any).away_team_id || 'Away Team';
  const spread = (config as any).spread_label || (config as any).spread || 'adjusted';
  return `Highest score between ${home} (${spread} points) and ${away}`;
}

function computeOptions({ config }: ModeContext): string[] {
  const spread = normalizeSpread(config as any);
  const allowsTie = spread != null && Number.isInteger(spread);
  const home = (config as any).home_team_name || (config as any).home_team_id || 'Home Team';
  const away = (config as any).away_team_name || (config as any).away_team_id || 'Away Team';
  if (allowsTie) {
    return ['No Entry', String(home), String(away), 'Tie'];
  }
  return ['No Entry', String(home), String(away)];
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  const spread = normalizeSpread(config as any);
  if (spread == null) errors.push('Spread required');
  return errors;
}

export const nbaSpreadTheWealthModule: LeagueModeModule = {
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
