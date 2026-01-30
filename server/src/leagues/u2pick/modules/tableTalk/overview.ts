import type { ModeOverview } from '../../../sharedUtils/types';
import { TABLE_TALK_MODE_KEY, TABLE_TALK_LABEL } from './constants';

export const tableTalkOverview: ModeOverview = {
  key: TABLE_TALK_MODE_KEY,
  label: TABLE_TALK_LABEL,
  tagline: 'Create your own bet with custom options.',
  description:
    'Table Talk lets you create a completely custom bet. Define your own winning condition, set your own options, and let the table decide. Perfect for friendly wagers on anything - from "who scores first" to "what color tie will the coach wear".',
  proposerConfiguration: [
    'Write a winning condition describing what determines the winner.',
    'Add between 2 and 6 options for participants to choose from.',
    'Set the wager amount and time limit.',
  ],
  participantChoices: [
    'No Entry — sit this bet out.',
    'Any of the custom options defined by the proposer.',
  ],
  winningCondition:
    'After the betting window closes, any participant can validate the bet by selecting the winning option. The selected choice becomes the official result.',
  notes: [
    'Unlike other modes, Table Talk bets are resolved manually by participants.',
    'Any participant can validate once the bet is pending.',
    'The bet remains pending until someone validates it.',
  ],
  example: {
    title: 'Example',
    description:
      'Winning condition: "Who will score the first touchdown?" with options "Team A", "Team B", "Neither". After the first touchdown is scored, any participant can click the validate button and select the correct answer.',
  },
};
