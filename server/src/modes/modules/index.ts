import type { ModeModule } from '../shared/types';
import { eitherOrModule } from './eitherOr';
import { totalDisasterModule } from './totalDisaster';
import { giveAndTakeModule } from './giveAndTake';
import { chooseTheirFateModule } from './chooseTheirFate';
import { scorcererModule } from './scorcerer';
import { propHuntModule } from './propHunt';

export const MODE_MODULES: ModeModule[] = [
  eitherOrModule,
  totalDisasterModule,
  giveAndTakeModule,
  chooseTheirFateModule,
  scorcererModule,
  propHuntModule,
];
