import { ModeDefinition, ModeKey } from './Mode';
import { bestOfBestMode } from './bestOfBest';
import { oneLegSpreadMode } from './oneLegSpread';

export const MODES: Record<ModeKey, ModeDefinition> = {
  best_of_best: bestOfBestMode,
  one_leg_spread: oneLegSpreadMode,
};

export type { ModeDefinition, ModeKey } from './Mode';
