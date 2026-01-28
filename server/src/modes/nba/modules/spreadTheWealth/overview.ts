import type { ModeOverview } from '../../../types';
import { NBA_SPREAD_THE_WEALTH_LABEL, NBA_SPREAD_THE_WEALTH_MODE_KEY } from './constants';

export const nbaSpreadTheWealthOverview: ModeOverview = {
  key: NBA_SPREAD_THE_WEALTH_MODE_KEY,
  label: NBA_SPREAD_THE_WEALTH_LABEL,
  tagline: 'Pick which side covers the adjusted spread.',
  description:
    'Spread The Wealth (NBA) lets you pick the winner against a custom spread. Whole-number spreads allow a Tie outcome; half-point spreads avoid pushes.',
  proposerConfiguration: [
    'Enter the spread between -99.5 and +99.5 in 0.5 increments (whole numbers allowed for tie possibility).'
  ],
  participantChoices: [
    'pass — skip this round.',
    'Home/Over — if spread is whole, this is Over; otherwise pick the home side to cover.',
    'Away/Under — if spread is whole, this is Under; otherwise pick the away side to cover.',
    'Tie — only available when the spread is a whole number.'
  ],
  winningCondition:
    'After the game ends, add the spread to the home score. If the adjusted home score beats the away score, Home/Over wins; if it matches on a whole-number spread, Tie wins; otherwise Away/Under wins.',
};
