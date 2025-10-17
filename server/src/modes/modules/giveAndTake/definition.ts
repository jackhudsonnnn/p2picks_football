import type { ModeModule } from '../../shared/types';
import { prepareGiveAndTakeConfig } from './prepareConfig';
import { giveAndTakeValidator } from './validator';
import { buildGiveAndTakeUserConfig } from './userConfig';

export const giveAndTakeModule: ModeModule = {
  definition: {
    key: 'give_and_take',
    label: 'Give And Take',
    summaryTemplate:
      '`Give And Take${config.spread_label || config.spread ? " • " + (config.spread_label || config.spread) : ""}`',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate: '`Spread applied to the home team score`',
    winningConditionTemplate:
      '`Highest score between ${(config.home_team_name || config.home_team_id || "Home Team")} (${(config.spread_label || config.spread || "spread")} points) and ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    optionsExpression:
      '(() => { const opts = ["pass"]; const home = config.home_team_name || config.home_team_id || "Home Team"; const away = config.away_team_name || config.away_team_id || "Away Team"; opts.push(home); opts.push(away); return opts; })()',
    configSteps: [],
    finalizeValidatorExpression:
      '(() => { const errors = []; const raw = Number(config.spread_value ?? config.spread ?? NaN); if (!config.spread && config.spread !== 0 && config.spread_value == null) errors.push("Spread required"); if (!Number.isFinite(raw)) { errors.push("Spread must be numeric"); } else { if (raw < -99.5 || raw > 99.5) errors.push("Spread must be between -99.5 and +99.5"); if (Math.abs(Math.round(raw * 2)) % 2 !== 1) errors.push("Spread must end in .5"); if (Math.abs(raw) < 0.5) errors.push("Spread cannot be 0"); } return errors; })()',
    metadata: {
      spreadRange: {
        min: -99.5,
        max: 99.5,
        step: 1,
        unit: 'points',
      },
    },
  },
  prepareConfig: prepareGiveAndTakeConfig,
  validator: giveAndTakeValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
    buildGiveAndTakeUserConfig({ nflGameId, existingConfig: config ?? {} }),
};
