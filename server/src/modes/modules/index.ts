import type { ModeModule } from '../shared/types';
import { eitherOrModule } from './eitherOr';
import { totalDisasterModule } from './totalDisaster';
import { giveAndTakeModule } from './giveAndTake';
import { chooseTheirFateModule } from './chooseTheirFate';
import { scorcererModule } from './scorcerer';
import { propHuntModule } from './propHunt';
import { kingOfTheHillModule } from './kingOfTheHill';

export const MODE_MODULES: ModeModule[] = [
  eitherOrModule,
  kingOfTheHillModule,
  totalDisasterModule,
  giveAndTakeModule,
  chooseTheirFateModule,
  scorcererModule,
  propHuntModule,
];
