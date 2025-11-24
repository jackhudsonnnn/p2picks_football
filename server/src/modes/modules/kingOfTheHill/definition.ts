import type { ModeModule } from '../../shared/types';
import {
  KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
  KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
} from './constants';
import { buildKingOfTheHillMetadata, prepareKingOfTheHillConfig } from './prepareConfig';
import { kingOfTheHillValidator } from './validator';
import { buildKingOfTheHillUserConfig } from './userConfig';
import { kingOfTheHillOverview } from './overview';

export const kingOfTheHillModule: ModeModule = {
  definition: {
    key: 'king_of_the_hill',
    label: 'King Of The Hill',
    summaryTemplate: '`King Of The Hill`',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate:
      '`First to ${config.resolve_value ?? "the selected value"} ${(config.stat_label || config.stat || "stat")} (${(config.progress_mode === "cumulative" ? "cumulative" : "Starting Now")} tracking).`',
    winningConditionTemplate:
      '`${(config.player1_name || config.player1_id || "Player 1")} vs ${(config.player2_name || config.player2_id || "Player 2")} — ${(config.progress_mode === "cumulative" ? "first to hit" : "first to add")} ${(config.resolve_value_label || config.resolve_value || KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE)} ${(config.stat_label || config.stat || "stat")}.`',
    optionsExpression:
      '(() => { const opts = ["pass"]; if (config.player1_name || config.player1_id) opts.push(config.player1_name || config.player1_id); if (config.player2_name || config.player2_id) opts.push(config.player2_name || config.player2_id); if (!opts.includes("Neither")) opts.push("Neither"); return opts; })()',
    configSteps: [
      {
        key: 'stat',
        component: 'kingOfTheHill.stat',
        label: 'Select Stat',
        props: {
          statKeyToCategory: KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
          statKeyLabels: KING_OF_THE_HILL_STAT_KEY_LABELS,
          allowedStatKeys: Object.keys(KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY),
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.stat) errors.push("Stat required"); return errors; })()',
      },
      {
        key: 'player1',
        component: 'kingOfTheHill.player1',
        label: 'Select Player 1',
        validatorExpression:
          '(() => { const errors = []; if (!config.player1_id) errors.push("Player 1 required"); return errors; })()',
      },
      {
        key: 'player2',
        component: 'kingOfTheHill.player2',
        label: 'Select Player 2',
        validatorExpression:
          '(() => { const errors = []; if (!config.player2_id) errors.push("Player 2 required"); if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) errors.push("Players must differ"); return errors; })()',
      },
      {
        key: 'resolve_value',
        component: 'kingOfTheHill.resolveValue',
        label: 'Resolve Value',
        props: {
          allowedValues: KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES,
          defaultValue: KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
        },
        validatorExpression:
          '(() => { const errors = []; const value = Number(config.resolve_value ?? config.resolve_value_label); if (!Number.isFinite(value)) { errors.push("Resolve value required"); } else if (value < 1 || value > 499) { errors.push("Resolve value must be between 1 and 499"); } return errors; })()',
      },
      {
        key: 'progress_mode',
        component: 'kingOfTheHill.progressMode',
        label: 'Track Progress',
        validatorExpression:
          '(() => { const errors = []; if (!config.progress_mode) errors.push("Progress tracking selection required"); return errors; })()',
      },
    ],
    finalizeValidatorExpression:
      '(() => { const errors = []; if (!config.player1_id || !config.player2_id) errors.push("Two players required"); if (!config.stat) errors.push("Stat required"); if (!config.progress_mode) errors.push("Progress tracking selection required"); const value = Number(config.resolve_value ?? config.resolve_value_label); if (!Number.isFinite(value)) errors.push("Resolve value required"); return errors; })()',
    metadata: buildKingOfTheHillMetadata(),
  },
  overview: kingOfTheHillOverview,
  prepareConfig: prepareKingOfTheHillConfig,
  validator: kingOfTheHillValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
    buildKingOfTheHillUserConfig({ nflGameId, existingConfig: config ?? {} }),
};
