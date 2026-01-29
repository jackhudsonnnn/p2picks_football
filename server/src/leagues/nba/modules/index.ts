import { LeagueModeModule } from '../../types';
import { nbaScoreSorcererModule } from './scoreSorcerer';
import { nbaTotalDisasterModule } from './totalDisaster';
import { nbaPropHuntModule } from './propHunt';
import { spreadTheWealthNbaModule } from './spreadTheWealth';
import { nbaEitherOrModule } from './eitherOr';
import { kingOfTheHillModule as nbaKingOfTheHillModule } from './kingOfTheHill';

/**
 * All NBA mode modules.
 * Add new NBA modes to this array to register them.
 */
export const NBA_MODE_MODULES: LeagueModeModule[] = [
  nbaScoreSorcererModule,
  nbaTotalDisasterModule,
  nbaPropHuntModule,
  spreadTheWealthNbaModule,
  nbaEitherOrModule,
  nbaKingOfTheHillModule,
];
