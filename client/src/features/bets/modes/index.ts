import { bestOfBestMode } from './best_of_best';
import { oneLegSpreadMode } from './one_leg_spread';
import { ModeDefinition } from './base';

export const modeRegistry: Record<string, ModeDefinition> = {
  [bestOfBestMode.key]: bestOfBestMode,
  [oneLegSpreadMode.key]: oneLegSpreadMode,
};

export type RegisteredModeKey = keyof typeof modeRegistry;
export * from './base';
