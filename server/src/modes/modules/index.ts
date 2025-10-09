import type { ModeModule } from '../shared/types';
import { bestOfBestModule } from './bestOfBest';
import { oneLegSpreadModule } from './oneLegSpread';
import { chooseTheirFateModule } from './chooseTheirFate';
import { scorcererModule } from './scorcerer';

export const MODE_MODULES: ModeModule[] = [
  bestOfBestModule,
  oneLegSpreadModule,
  chooseTheirFateModule,
  scorcererModule,
];
