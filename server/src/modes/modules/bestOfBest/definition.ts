import type { ModeModule } from '../../shared/types';
import { BEST_OF_BEST_ALLOWED_RESOLVE_AFTER, STAT_KEY_TO_CATEGORY } from './constants';
import { buildBestOfBestMetadata, prepareBestOfBestConfig } from './prepareConfig';
import { bestOfBestValidator } from './validator';
import { buildBestOfBestUserConfig } from './userConfig';

export const bestOfBestModule: ModeModule = {
  definition: {
    key: 'best_of_best',
    label: 'Best of the Best',
    summaryTemplate: '`Best of the Best • ${config.stat_label || config.stat || ""} • ${config.resolve_after || ""}`',
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
        component: 'bestOfBest.players',
        label: 'Select Players',
        validatorExpression:
          '(() => { const errors: string[] = []; if (!config.player1_id) errors.push("Player 1 required"); if (!config.player2_id) errors.push("Player 2 required"); if (config.player1_id && config.player2_id && String(config.player1_id) === String(config.player2_id)) errors.push("Players must differ"); return errors; })()',
      },
      {
        key: 'stat_resolve',
        component: 'bestOfBest.statResolve',
        label: 'Stat & Resolve',
        props: {
          allowedResolveAfter: BEST_OF_BEST_ALLOWED_RESOLVE_AFTER,
          statKeyToCategory: STAT_KEY_TO_CATEGORY,
          allowedStatKeys: Object.keys(STAT_KEY_TO_CATEGORY),
        },
        validatorExpression:
          '(() => { const errors: string[] = []; if (!config.stat) errors.push("Stat required"); if (!config.resolve_after) errors.push("Resolve after required"); return errors; })()',
      },
    ],
    finalizeValidatorExpression:
      '(() => { const errors: string[] = []; if (!config.player1_id || !config.player2_id) errors.push("Two players required"); if (!config.stat) errors.push("Stat required"); return errors; })()',
    metadata: buildBestOfBestMetadata(),
  },
  prepareConfig: prepareBestOfBestConfig,
  validator: bestOfBestValidator,
  buildUserConfig: async ({ nflGameId }) => buildBestOfBestUserConfig({ nflGameId }),
};
