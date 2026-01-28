import type { ModeOverview } from '../../../types';
import { NBA_TOTAL_DISASTER_LABEL, NBA_TOTAL_DISASTER_MODE_KEY } from './constants';

export const nbaTotalDisasterOverview: ModeOverview = {
  key: NBA_TOTAL_DISASTER_MODE_KEY,
  label: NBA_TOTAL_DISASTER_LABEL,
  tagline: 'Pick whether the total points go over or under the line.',
  description:
    'Total Disaster (NBA) turns the table into a collaborative over/under. Once the proposer sets a line, everyone wagers on whether the combined score will clear it or fall short.',
  proposerConfiguration: [
    'Enter the over/under line. It must be numeric, end in .5, and represent total combined points.'
  ],
  participantChoices: [
    'pass — skip this round.',
    'Over — predict the total score will finish above the line.',
    'Under — predict the total score will end below the line.'
  ],
  winningCondition:
    'After the game goes final, add the home and away scores. If the total is greater than the line, Over wins; if it is lower, Under wins.',
  notes: [
    'The .5 requirement prevents ties, so one side always wins when the game is completed.'
  ],
  example: {
    title: 'Example',
    description:
      'Line set at 217.5. Final score: Home 112, Away 108. Total points equal 220, which beats the line, so everyone who picked Over wins the pool.'
  }
};
