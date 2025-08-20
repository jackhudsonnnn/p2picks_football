import { BetModeKey } from './types';

export type ModeSummary = (ctx: any) => string;

export interface ModeDefinition {
  key: BetModeKey;
  label: string;
  // Produces a human description from a bet record/config
  summary: ModeSummary;
  // Returns the allowed choice options for UI pickers
  options: (ctx: any) => string[];
}

export const modeRegistry: Record<BetModeKey, ModeDefinition> = {
  best_of_best: {
    key: 'best_of_best',
    label: 'Best of the Best',
    summary: (ctx: any) => {
      const cfg = ctx?.bet_mode_best_of_best || ctx?.modeConfig;
      if (!cfg) return 'Best of the Best';
      return `Best of the Best • ${cfg.stat ?? ''} • ${cfg.resolve_after ?? ''}`.trim();
    },
    options: (ctx: any) => {
      const cfg = ctx?.bet_mode_best_of_best || ctx?.modeConfig;
      const p1 = cfg?.player1_name;
      const p2 = cfg?.player2_name;
      return ['pass', ...(p1 ? [p1] : []), ...(p2 ? [p2] : [])];
    },
  },
  one_leg_spread: {
    key: 'one_leg_spread',
    label: '1 Leg Spread',
    summary: () => '1 Leg Spread',
    options: () => ['pass', '0-3', '4-10', '11-25', '26+'],
  },
};
