import type { ModeModule } from '../../shared/types';
import { propHuntOverview } from './overview';
import { buildPropHuntUserConfig } from './userConfig';
import { preparePropHuntConfig } from './prepareConfig';
import { propHuntValidator } from './validator';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT, PROP_HUNT_LINE_RANGE, STAT_KEY_LABELS } from './constants';
import { getPropHuntLiveInfo } from './liveInfo';

export const propHuntModule: ModeModule = {
  definition: {
    key: 'prop_hunt',
    label: 'Prop Hunt',
    summaryTemplate: '`Prop Hunt`',
    matchupTemplate:
      '`${(config.home_team_abbrev || config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_abbrev || config.away_team_name || config.away_team_id || "Away Team")}`',
    winningConditionTemplate:
      '`${(config.player_name || config.player_id || "the player")} over/under ${(config.line_label || config.line || "the line")} ${(config.stat_label || config.stat || "stat")} ${(config.progress_mode === "cumulative" ? "" : "now")} until ${(config.resolve_at || "settle time")}`',
    optionsExpression: "['pass','Over','Under']",
    configSteps: [
      {
        key: 'stat',
        component: 'propHunt.stat',
        label: 'Select Stat',
        props: {
          statKeyLabels: STAT_KEY_LABELS,
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.stat) errors.push("Stat required"); return errors; })()',
      },
      {
        key: 'player',
        component: 'propHunt.player',
        label: 'Select Player',
        validatorExpression:
          '(() => { const errors = []; if (!config.player_id && !config.player_name) errors.push("Player required"); return errors; })()',
      },
      {
        key: 'resolve_at',
        component: 'propHunt.resolveAt',
        label: 'Resolve At',
        props: {
          allowedResolveAt: PROP_HUNT_ALLOWED_RESOLVE_AT,
          defaultResolveAt: PROP_HUNT_DEFAULT_RESOLVE_AT,
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
      },
      {
        key: 'progress_mode',
        component: 'propHunt.progressMode',
        label: 'Track Progress',
        description: 'Decide whether to capture a Starting Now baseline or use full-game totals before setting the line.',
        validatorExpression:
          '(() => { const errors = []; if (!config.progress_mode) errors.push("Progress tracking selection required"); return errors; })()',
      },
      {
        key: 'line',
        component: 'propHunt.line',
        label: 'Set Line',
        props: {
          lineRange: PROP_HUNT_LINE_RANGE,
        },
        validatorExpression:
          '(() => { const errors = []; const raw = Number(config.line_value ?? config.line ?? NaN); if (!config.line && config.line !== 0 && config.line_value == null) errors.push("Line required"); if (!Number.isFinite(raw)) { errors.push("Line must be numeric"); } else { if (raw < 0.5 || raw > 499.5) errors.push("Line must be between 0.5 and 499.5"); if (Math.abs(Math.round(raw * 2)) % 2 !== 1) errors.push("Line must end in .5"); } return errors; })()',
      },
    ],
    finalizeValidatorExpression:
  '(() => { const errors = []; if (!config.player_id && !config.player_name) errors.push("Player required"); if (!config.stat) errors.push("Stat required"); if (!config.progress_mode) errors.push("Progress tracking selection required"); const raw = Number(config.line_value ?? config.line ?? NaN); if (!config.line && config.line !== 0 && config.line_value == null) errors.push("Line required"); if (!Number.isFinite(raw)) { errors.push("Line must be numeric"); } else { if (raw < 0.5 || raw > 499.5) errors.push("Line must be between 0.5 and 499.5"); if (Math.abs(Math.round(raw * 2)) % 2 !== 1) errors.push("Line must end in .5"); } if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
    metadata: {
      allowedResolveAt: PROP_HUNT_ALLOWED_RESOLVE_AT,
      defaultResolveAt: PROP_HUNT_DEFAULT_RESOLVE_AT,
      statKeyLabels: STAT_KEY_LABELS,
      lineRange: PROP_HUNT_LINE_RANGE,
      progressModes: ['starting_now', 'cumulative'],
    },
  },
  overview: propHuntOverview,
  prepareConfig: preparePropHuntConfig,
  validator: propHuntValidator,
  buildUserConfig: async ({ nflGameId, config }) => buildPropHuntUserConfig({ nflGameId, existingConfig: config ?? {} }),
  getLiveInfo: getPropHuntLiveInfo,
};
