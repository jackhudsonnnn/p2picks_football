import type { ModeOverview } from '../../shared/types';
import { SCORE_SORCERER_LABEL, SCORE_SORCERER_NO_MORE_SCORES } from './constants';

export const scoreSorcererOverview: ModeOverview = {
  key: 'score_sorcerer',
  label: SCORE_SORCERER_LABEL,
  tagline: 'Pick which team scores next.',
  description: 'A quick-pick wager: choose which side will put up the next points. If nobody scores again, "No More Scores" wins.',
  proposerConfiguration: [
    'No extra configuration beyond selecting the game/table.',
  ],
  participantChoices: ['pass', 'Home Team', 'Away Team', SCORE_SORCERER_NO_MORE_SCORES],
  winningCondition:
    'The first team to add points after the bet locks wins. If the game ends without additional scoring, "No More Scores" wins.',
  notes: [
    'If both teams’ scores increase on the same update, the bet washes.',
  ],
};
