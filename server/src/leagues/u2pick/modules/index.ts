import { LeagueModeModule } from '../../types';
import { tableTalkModule } from './tableTalk';

/**
 * All U2Pick mode modules.
 * Add new U2Pick modes to this array to register them.
 */
export const U2PICK_MODE_MODULES: LeagueModeModule[] = [
  tableTalkModule,
];
