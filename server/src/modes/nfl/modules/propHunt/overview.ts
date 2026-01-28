import type { ModeOverview } from '../../../sharedUtils/types';
import { PROP_HUNT_MODE_KEY, PROP_HUNT_LABEL } from './constants';

export const propHuntOverview: ModeOverview = {
  key: PROP_HUNT_MODE_KEY,
  label: PROP_HUNT_LABEL,
  tagline: 'Chase a single-player prop and decide if they clear the line.',
  description:
    'Prop Hunt tracks one player against a hand-picked stat line. The proposer chooses the athlete, selects which stat to watch, and sets the over/under threshold. Everyone else hunts for value by choosing Over, Under, or passing.',
  proposerConfiguration: [
    'Pick the player you want to feature.',
    'Choose which stat to monitor (passing yards, receptions, tackles, etc.).',
    'Decide how to track progress: capture a Starting Now baseline or use cumulative totals.',
    'Set the over/under line. It must be numeric, end in .5, and reflect the total that player needs to clear when the bet settles.',
    'Optionally decide whether the bet settles at halftime or end of game (defaults to end of game).',
  ],
  participantChoices: [
    'pass — sit this prop out.',
    'Over — predict the player will eclipse the stat line.',
    'Under — predict the player will fall short of the line.'
  ],
  winningCondition:
    'When the selected settle time hits, compare the player’s stat total against the chosen line. If the total beats the line, Over wins; if it finishes below the line, Under wins. An exact match washes the bet.',
  notes: [
    'With cumulative tracking the line must stay at least 0.5 above the player’s current stat; with Starting Now you can start at 0.5 because a baseline snapshot is taken when betting closes. In either case, if the requirement is already met before locking, the bet washes.',
    'The .5 requirement prevents pushes in most scenarios, but an exact match will still wash the wager.',
    'Choosing Starting Now captures the player’s current stat when betting closes and treats the line as the amount they must add afterward.',
  ],
  example: {
    title: 'Example',
    description:
      'Player: Justin Jefferson. Stat: Receiving Yards. Line: 112.5. He ends the game with 108 yards. Because 108 falls short of the 112.5 line, the Under side takes the pot.',
  },
};
