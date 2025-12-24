import type { ModeModule } from '../shared/types';
import { eitherOrModule } from './eitherOr';
import { totalDisasterModule } from './totalDisaster';
import { spreadTheWealthModule } from './spreadTheWealth';
import { chooseTheirFateModule } from './chooseTheirFate';
import { propHuntModule } from './propHunt';
import { kingOfTheHillModule } from './kingOfTheHill';

export const MODE_MODULES: ModeModule[] = [
  eitherOrModule,
  kingOfTheHillModule,
  totalDisasterModule,
  spreadTheWealthModule,
  chooseTheirFateModule,
  propHuntModule,
];
