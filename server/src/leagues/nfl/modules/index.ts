import type { LeagueModeModule } from '../../types';
import { eitherOrModule } from './eitherOr';
import { totalDisasterModule } from './totalDisaster';
import { spreadTheWealthModule } from './spreadTheWealth';
import { chooseTheirFateModule } from './chooseTheirFate';
import { propHuntModule } from './propHunt';
import { kingOfTheHillModule } from './kingOfTheHill';
import { scoreSorcererModule } from './scoreSorcerer';

export const MODE_MODULES: LeagueModeModule[] = [
  chooseTheirFateModule,
  eitherOrModule,
  kingOfTheHillModule,
  propHuntModule,
  scoreSorcererModule,
  spreadTheWealthModule,
  totalDisasterModule,
];
