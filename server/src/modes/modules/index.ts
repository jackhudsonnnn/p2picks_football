import type { ModeModule } from '../shared/types';
import { eitherOrModule } from './eitherOr';
import { differenceInOpinionModule } from './differenceInOpinion';
import { spreadTheWealthModule } from './spreadTheWealth';
import { giveAndTakeModule } from './giveAndTake';
import { chooseTheirFateModule } from './chooseTheirFate';
import { scorcererModule } from './scorcerer';

export const MODE_MODULES: ModeModule[] = [
  eitherOrModule,
  differenceInOpinionModule,
  spreadTheWealthModule,
  giveAndTakeModule,
  chooseTheirFateModule,
  scorcererModule,
];
