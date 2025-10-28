import type { ModeOverview } from '../../shared/types';

export const propHuntOverview: ModeOverview = {
  key: 'prop_hunt',
  label: 'Prop Hunt',
  tagline: 'Chase a single-player prop and decide if they clear the line.',
  description:
    'Prop Hunt tracks one player against a hand-picked stat line. The proposer chooses the athlete, selects which stat to watch, and sets the over/under threshold. Everyone else hunts for value by choosing Over, Under, or passing.',
  proposerConfiguration: [
    'Pick the player you want to feature.',
    'Choose which stat to monitor (passing yards, receptions, tackles, etc.).',
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
    'The line can never sit below the player’s current stat + 0.5, and if the player already cleared the line before the bet locked it automatically washes.',
    'The .5 requirement prevents pushes in most scenarios, but an exact match will still wash the wager.',
  ],
  example: {
    title: 'Example',
    description:
      'Player: Justin Jefferson. Stat: Receiving Yards. Line: 112.5. He ends the game with 108 yards. Because 108 falls short of the 112.5 line, the Under side takes the pot.',
  },
};
