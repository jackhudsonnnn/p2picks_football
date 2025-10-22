import type { ModeOverview } from '../../shared/types';

export const giveAndTakeOverview: ModeOverview = {
  key: 'give_and_take',
  label: 'Give And Take',
  tagline: 'Will the home team cover the chosen spread?',
  description:
    'Give And Take lets the table decide a custom spread for the matchup. The home team receives the spread value and everyone bets on which side covers when the game ends.',
  proposerConfiguration: [
    'Set the numeric spread applied to the home team. The value must end in .5 so there is always a decision.'
  ],
  participantChoices: [
    'pass — skip the wager.',
    'Home Team — backing the home team after the spread is applied.',
    'Away Team — backing the away team to overcome the spread.'
  ],
  winningCondition:
    'Add the spread to the home team’s final score. If the adjusted home total is higher, everyone on Home Team wins; otherwise the Away Team covers.',
  notes: [
    'The spread always modifies the home team (Team 1).',
    'Because the spread ends in .5, pushes cannot occur in normal play.'
  ],
  example: {
    title: 'Example',
    description:
      'Spread set to -3.5 for the home team. Final score: Home 31, Away 24. Subtracting 3.5 yields an adjusted home total of 27.5, which still beats 24, so Home Team backers take the pot.'
  }
};