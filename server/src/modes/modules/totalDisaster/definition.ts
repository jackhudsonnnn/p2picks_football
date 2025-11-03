import type { ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from '../eitherOr/constants';
import { prepareTotalDisasterConfig } from './prepareConfig';
import { totalDisasterValidator } from './validator';
import { buildTotalDisasterUserConfig } from './userConfig';
import { totalDisasterOverview } from './overview';

export const totalDisasterModule: ModeModule = {
  definition: {
    key: 'spread_the_wealth',
    label: 'Total Disaster',
    summaryTemplate:
      'Total Disaster',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate: '`Total points compared to the selected line`',
    winningConditionTemplate:
      '`Total points between ${(config.home_team_name || config.home_team_id || "Home Team")} and ${(config.away_team_name || config.away_team_id || "Away Team")} over/under ${(config.line_label || config.line || "line")}`',
    optionsExpression: "['pass','Over','Under']",
    configSteps: [],
    finalizeValidatorExpression:
      '(() => { const errors = []; const raw = Number(config.line_value ?? config.line ?? NaN); if (!config.line && config.line !== 0 && config.line_value == null) errors.push("Line required"); if (!Number.isFinite(raw)) { errors.push("Line must be numeric"); } else { if (raw < 0.5 || raw > 199.5) errors.push("Line must be between 0.5 and 199.5"); if (Math.abs(Math.round(raw * 2)) % 2 !== 1) errors.push("Line must end in .5"); } if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
    metadata: {
      lineRange: {
        min: 0.5,
        max: 199.5,
        step: 1,
        unit: 'points',
      },
      allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
      defaultResolveAt: EITHER_OR_DEFAULT_RESOLVE_AT,
    },
  },
  overview: totalDisasterOverview,
  prepareConfig: prepareTotalDisasterConfig,
  validator: totalDisasterValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
    buildTotalDisasterUserConfig({ nflGameId, existingConfig: config ?? {} }),
};
