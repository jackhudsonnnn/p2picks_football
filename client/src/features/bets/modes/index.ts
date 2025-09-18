import { bestOfBestMode } from './best_of_best';
import { oneLegSpreadMode } from './one_leg_spread';
import { scorcererMode } from './scorcerer';
import { chooseTheirFateMode } from './choose_their_fate';
import { ModeDefinition } from './base';

export const modeRegistry: Record<string, ModeDefinition> = {
  [bestOfBestMode.key]: bestOfBestMode,
  [oneLegSpreadMode.key]: oneLegSpreadMode,
  [scorcererMode.key]: scorcererMode,
  [chooseTheirFateMode.key]: chooseTheirFateMode,
};

export type RegisteredModeKey = keyof typeof modeRegistry;
export * from './base';
