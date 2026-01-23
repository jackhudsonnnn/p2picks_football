import { LeagueModeModule } from '../../types';
import { nbaScoreSorcererModule } from './scoreSorcerer';

/**
 * All NBA mode modules.
 * Add new NBA modes to this array to register them.
 */
export const NBA_MODE_MODULES: LeagueModeModule[] = [
  nbaScoreSorcererModule,
];
