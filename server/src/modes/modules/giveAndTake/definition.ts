import type { ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from '../eitherOr/constants';
import { prepareGiveAndTakeConfig } from './prepareConfig';
import { giveAndTakeValidator } from './validator';
import { buildGiveAndTakeUserConfig } from './userConfig';
import { giveAndTakeOverview } from './overview';

export const giveAndTakeModule: ModeModule = {
  definition: {
    key: 'give_and_take',
    label: 'Give And Take',
    summaryTemplate:
      'Give And Take',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate: '`Spread applied to the home team score`',
    winningConditionTemplate:
      '`Highest score between ${(config.home_team_name || config.home_team_id || "Home Team")} (${(config.spread_label || config.spread || "spread")} points) and ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    optionsExpression:
      '(() => { const opts = ["pass"]; const home = config.home_team_name || config.home_team_id || "Home Team"; const away = config.away_team_name || config.away_team_id || "Away Team"; opts.push(home); opts.push(away); return opts; })()',
    configSteps: [
      {
        key: 'spread',
        component: 'giveAndTake.spread',
        label: 'Select Point Spread',
        validatorExpression:
          '(() => { const errors = []; if (!config.spread && config.spread !== 0 && config.spread_value == null) errors.push("Spread required"); return errors; })()',
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
      '(() => { const errors = []; const raw = Number(config.spread_value ?? config.spread ?? NaN); if (!config.spread && config.spread !== 0 && config.spread_value == null) errors.push("Spread required"); if (!Number.isFinite(raw)) { errors.push("Spread must be numeric"); } else { if (raw < -99.5 || raw > 99.5) errors.push("Spread must be between -99.5 and +99.5"); if (Math.abs(Math.round(raw * 2)) % 2 !== 1) errors.push("Spread must end in .5"); if (Math.abs(raw) < 0.5) errors.push("Spread cannot be 0"); } if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
    metadata: {
      spreadRange: {
        min: -99.5,
        max: 99.5,
        step: 1,
        unit: 'points',
      },
      allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
      defaultResolveAt: EITHER_OR_DEFAULT_RESOLVE_AT,
    },
  },
  overview: giveAndTakeOverview,
  prepareConfig: prepareGiveAndTakeConfig,
  validator: giveAndTakeValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
    buildGiveAndTakeUserConfig({ nflGameId, existingConfig: config ?? {} }),
};
