import type { ModeModule } from '../../shared/types';
import { propHuntOverview } from './overview';
import { buildPropHuntUserConfig } from './userConfig';
import { preparePropHuntConfig } from './prepareConfig';
import { propHuntValidator } from './validator';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_LINE_RANGE, STAT_KEY_LABELS } from './constants';

export const propHuntModule: ModeModule = {
  definition: {
    key: 'prop_hunt',
    label: 'Prop Hunt',
    summaryTemplate: '`Prop Hunt`',
    descriptionTemplate:
      '`${(config.player_name || config.player_id || "Selected Player")} • ${(config.stat_label || config.stat || "Stat")}`',
    secondaryDescriptionTemplate:
      '`Compare ${(config.player_name || config.player_id || "Selected Player")}\'s ${(config.stat_label || config.stat || "stat")} total to ${(config.line_label || config.line || "the line")} at ${(config.resolve_at || "settle time")}`',
    winningConditionTemplate:
      '`Total ${(config.stat_label || config.stat || "stat")} for ${(config.player_name || config.player_id || "the player")} at ${(config.resolve_at || "settle time")} vs ${(config.line_label || config.line || "line")}`',
    optionsExpression: "['pass','Over','Under']",
    configSteps: [],
    finalizeValidatorExpression:
  '(() => { const errors = []; if (!config.player_id && !config.player_name) errors.push("Player required"); if (!config.stat) errors.push("Stat required"); const raw = Number(config.line_value ?? config.line ?? NaN); if (!config.line && config.line !== 0 && config.line_value == null) errors.push("Line required"); if (!Number.isFinite(raw)) { errors.push("Line must be numeric"); } else { if (raw < 0.5 || raw > 499.5) errors.push("Line must be between 0.5 and 499.5"); if (Math.abs(Math.round(raw * 2)) % 2 !== 1) errors.push("Line must end in .5"); } return errors; })()',
    metadata: {
      allowedResolveAt: PROP_HUNT_ALLOWED_RESOLVE_AT,
      statKeyLabels: STAT_KEY_LABELS,
      lineRange: PROP_HUNT_LINE_RANGE,
    },
  },
  overview: propHuntOverview,
  prepareConfig: preparePropHuntConfig,
  validator: propHuntValidator,
  buildUserConfig: async ({ nflGameId, config }) => buildPropHuntUserConfig({ nflGameId, existingConfig: config ?? {} }),
};
