import type { ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AT, STAT_KEY_TO_CATEGORY, STAT_KEY_LABELS } from './constants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';
import { eitherOrOverview } from './overview';

export const eitherOrModule: ModeModule = {
  definition: {
    key: 'either_or',
    label: 'Either Or',
    summaryTemplate: '`Either Or`',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate:
      '`${(config.progress_mode === "cumulative" ? "Highest total " : "Largest net gain in ")}${(config.stat_label || config.stat || "stat")} by ${(config.resolve_at || "the selected time")}`',
    winningConditionTemplate:
      '`${(config.player1_name || config.player1_id || "Player 1")} vs ${(config.player2_name || config.player2_id || "Player 2")} ${config.stat_label || config.stat || "stat"} until ${config.resolve_at || "the selected time"}`',
    optionsExpression:
      '(() => { const opts = ["pass"]; if (config.player1_name || config.player1_id) opts.push(config.player1_name || config.player1_id); if (config.player2_name || config.player2_id) opts.push(config.player2_name || config.player2_id); return opts; })()',
    configSteps: [
      {
        key: 'stat',
        component: 'eitherOr.stat',
        label: 'Select Stat',
        props: {
          statKeyToCategory: STAT_KEY_TO_CATEGORY,
          statKeyLabels: STAT_KEY_LABELS,
          allowedStatKeys: Object.keys(STAT_KEY_TO_CATEGORY),
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.stat) errors.push("Stat required"); return errors; })()',
      },
      {
        key: 'player1',
        component: 'eitherOr.player1',
        label: 'Select Player 1',
        validatorExpression:
          '(() => { const errors = []; if (!config.player1_id) errors.push("Player 1 required"); return errors; })()',
      },
      {
        key: 'player2',
        component: 'eitherOr.player2',
        label: 'Select Player 2',
        validatorExpression:
          '(() => { const errors = []; if (!config.player2_id) errors.push("Player 2 required"); if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) errors.push("Players must differ"); return errors; })()',
      },
      {
        key: 'resolve_at',
        component: 'eitherOr.resolve',
        label: 'Resolve At',
        props: {
          allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
      },
      {
        key: 'progress_mode',
        component: 'eitherOr.progressMode',
        label: 'Track Progress',
        description: 'Determine whether to compare cumulative stats or gains after betting closes.',
        validatorExpression:
          '(() => { const errors = []; if (!config.progress_mode) errors.push("Progress tracking selection required"); return errors; })()',
      },
    ],
    finalizeValidatorExpression:
      '(() => { const errors = []; if (!config.player1_id || !config.player2_id) errors.push("Two players required"); if (!config.stat) errors.push("Stat required"); if (!config.progress_mode) errors.push("Progress tracking selection required"); return errors; })()',
    metadata: buildEitherOrMetadata(),
  },
  overview: eitherOrOverview,
  prepareConfig: prepareEitherOrConfig,
  validator: eitherOrValidator,
  buildUserConfig: async ({ nflGameId, config }) =>
    buildEitherOrUserConfig({ nflGameId, existingConfig: config ?? {} }),
};
