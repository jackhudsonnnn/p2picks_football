import type { ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from '../eitherOr/constants';
import { prepareSpreadTheWealthConfig } from './prepareConfig';
import { spreadTheWealthValidator } from './validator';
import { buildSpreadTheWealthUserConfig } from './userConfig';
import { spreadTheWealthOverview } from './overview';
import { getSpreadTheWealthLiveInfo } from './liveInfo';

export const spreadTheWealthModule: ModeModule = {
  definition: {
    key: 'spread_the_wealth',
    label: 'Spread The Wealth',
    summaryTemplate: 'Spread The Wealth',
    matchupTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    winningConditionTemplate:
      '`Highest score between ${(config.home_team_name || config.home_team_id || "Home Team")} (${(config.spread_label || config.spread || "adjusted")} points) and ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    optionsExpression:
      '(() => { const opts = ["pass"]; const spreadRaw = Number(config.spread_value ?? config.spread ?? NaN); const allowTie = Number.isFinite(spreadRaw) && Number.isInteger(spreadRaw); if (allowTie) { opts.push("Over"); opts.push("Under"); opts.push("Tie"); return opts; } const home = config.home_team_name || config.home_team_id || "Home Team"; const away = config.away_team_name || config.away_team_id || "Away Team"; opts.push(home); opts.push(away); return opts; })()',
    configSteps: [
      {
        key: 'spread',
        component: 'spreadTheWealth.spread',
        label: 'Select Point Spread',
        validatorExpression:
          '(() => { const errors = []; const raw = Number(config.spread_value ?? config.spread ?? NaN); if (!config.spread && config.spread !== 0 && config.spread_value == null) errors.push("Spread required"); if (!Number.isFinite(raw)) { errors.push("Spread must be numeric"); } else { if (raw < -99.5 || raw > 99.5) errors.push("Spread must be between -99.5 and +99.5"); if (Math.abs(raw * 2 - Math.round(raw * 2)) > 1e-9) errors.push("Spread must be in 0.5 increments (whole numbers allowed)"); } return errors; })()',
      },
      {
        key: 'resolve_at',
        component: 'shared.resolveAt',
        label: 'Resolve At',
        props: {
          allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
          defaultResolveAt: EITHER_OR_DEFAULT_RESOLVE_AT,
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
      },
    ],
    finalizeValidatorExpression:
      '(() => { const errors = []; const raw = Number(config.spread_value ?? config.spread ?? NaN); if (!config.spread && config.spread !== 0 && config.spread_value == null) errors.push("Spread required"); if (!Number.isFinite(raw)) { errors.push("Spread must be numeric"); } else { if (raw < -99.5 || raw > 99.5) errors.push("Spread must be between -99.5 and +99.5"); if (Math.abs(raw * 2 - Math.round(raw * 2)) > 1e-9) errors.push("Spread must be in 0.5 increments (whole numbers allowed)"); } if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
    metadata: {
      spreadRange: {
        min: -99.5,
        max: 99.5,
        step: 0.5,
        unit: 'points',
      },
      allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
      defaultResolveAt: EITHER_OR_DEFAULT_RESOLVE_AT,
    },
  },
  overview: spreadTheWealthOverview,
  prepareConfig: prepareSpreadTheWealthConfig,
  validator: spreadTheWealthValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
  buildSpreadTheWealthUserConfig({ nflGameId, existingConfig: config ?? {} }),
  getLiveInfo: getSpreadTheWealthLiveInfo,
};
