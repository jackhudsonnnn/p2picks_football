import type { ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AT, STAT_KEY_TO_CATEGORY, STAT_KEY_LABELS } from './constants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';

export const eitherOrModule: ModeModule = {
  definition: {
    key: 'either_or',
    label: 'Either Or',
    summaryTemplate: '`Either Or • ${config.stat_label || config.stat || ""} • ${config.resolve_at || ""}`',
    descriptionTemplate:
      '`${(config.home_team_name || config.home_team_id || "Home Team")} vs ${(config.away_team_name || config.away_team_id || "Away Team")}`',
    secondaryDescriptionTemplate:
      '`Largest next increase of stats, baseline stats captured at bet close`',
    winningConditionTemplate:
      '`Largest net increase in ${config.stat_label || config.stat || "stat"} between ${(config.player1_name || config.player1_id || "Player 1")} (${config.player1_team_name || config.player1_team || "Team 1"}) and ${(config.player2_name || config.player2_id || "Player 2")} (${config.player2_team_name || config.player2_team || "Team 2"}) until ${config.resolve_at || "the selected time"}`',
    optionsExpression:
      '(() => { const opts = ["pass"]; if (config.player1_name || config.player1_id) opts.push(config.player1_name || config.player1_id); if (config.player2_name || config.player2_id) opts.push(config.player2_name || config.player2_id); return opts; })()',
    configSteps: [
      {
        key: 'players',
        component: 'eitherOr.players',
        label: 'Select Players',
        validatorExpression:
          '(() => { const errors = []; if (!config.player1_id) errors.push("Player 1 required"); if (!config.player2_id) errors.push("Player 2 required"); if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) errors.push("Players must differ"); return errors; })()',
      },
      {
        key: 'stat_resolve',
        component: 'eitherOr.statResolve',
        label: 'Stat & Resolve',
        props: {
          allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
          statKeyToCategory: STAT_KEY_TO_CATEGORY,
          statKeyLabels: STAT_KEY_LABELS,
          allowedStatKeys: Object.keys(STAT_KEY_TO_CATEGORY),
        },
        validatorExpression:
          '(() => { const errors = []; if (!config.stat) errors.push("Stat required"); if (!config.resolve_at) errors.push("Resolve at required"); return errors; })()',
      },
    ],
    finalizeValidatorExpression:
      '(() => { const errors = []; if (!config.player1_id || !config.player2_id) errors.push("Two players required"); if (!config.stat) errors.push("Stat required"); return errors; })()',
    metadata: buildEitherOrMetadata(),
  },
  prepareConfig: prepareEitherOrConfig,
  validator: eitherOrValidator,
  buildUserConfig: async ({ nflGameId }) => buildEitherOrUserConfig({ nflGameId }),
};
