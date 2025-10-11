import type { ModeModule } from '../../shared/types';
import { EITHER_OR_ALLOWED_RESOLVE_AFTER, STAT_KEY_TO_CATEGORY } from './constants';
import { buildEitherOrMetadata, prepareEitherOrConfig } from './prepareConfig';
import { eitherOrValidator } from './validator';
import { buildEitherOrUserConfig } from './userConfig';

export const eitherOrModule: ModeModule = {
  definition: {
    key: 'either_or',
    label: 'Either Or',
    summaryTemplate: '`Either Or • ${config.stat_label || config.stat || ""} • ${config.resolve_after || ""}`',
    descriptionTemplate:
      '`${config.player1_name || config.player1_id || "Player 1"} vs ${config.player2_name || config.player2_id || "Player 2"} largest increase in ${config.stat_label || config.stat || "stat"} until ${config.resolve_after || "selected time"}`',
    secondaryDescriptionTemplate:
      '`${config.player1_name || config.player1_id || "Player 1"} vs ${config.player2_name || config.player2_id || "Player 2"}`',
    winningConditionTemplate:
      '`Largest net increase in ${config.stat_label || config.stat || "stat"} between the selected players until ${config.resolve_after || "the selected time"}`',
    optionsExpression:
      '(() => { const opts = ["pass"]; if (config.player1_name || config.player1_id) opts.push(config.player1_name || config.player1_id); if (config.player2_name || config.player2_id) opts.push(config.player2_name || config.player2_id); return opts; })()',
    configSteps: [
      {
        key: 'players',
        component: 'eitherOr.players',
        label: 'Select Players',
        validatorExpression:
          '(() => { const errors: string[] = []; if (!config.player1_id) errors.push("Player 1 required"); if (!config.player2_id) errors.push("Player 2 required"); if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) errors.push("Players must differ"); return errors; })()',
      },
      {
        key: 'stat_resolve',
        component: 'eitherOr.statResolve',
        label: 'Stat & Resolve',
        props: {
          allowedResolveAfter: EITHER_OR_ALLOWED_RESOLVE_AFTER,
          statKeyToCategory: STAT_KEY_TO_CATEGORY,
          allowedStatKeys: Object.keys(STAT_KEY_TO_CATEGORY),
        },
        validatorExpression:
          '(() => { const errors: string[] = []; if (!config.stat) errors.push("Stat required"); if (!config.resolve_after) errors.push("Resolve after required"); return errors; })()',
      },
    ],
    finalizeValidatorExpression:
      '(() => { const errors: string[] = []; if (!config.player1_id || !config.player2_id) errors.push("Two players required"); if (!config.stat) errors.push("Stat required"); return errors; })()',
    metadata: buildEitherOrMetadata(),
  },
  prepareConfig: prepareEitherOrConfig,
  validator: eitherOrValidator,
  buildUserConfig: async ({ nflGameId }) => buildEitherOrUserConfig({ nflGameId }),
};
