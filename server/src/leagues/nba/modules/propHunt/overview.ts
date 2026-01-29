import type { ModeOverview } from '../../../types';
import { NBA_PROP_HUNT_LABEL, NBA_PROP_HUNT_MODE_KEY } from './constants';

export const nbaPropHuntOverview: ModeOverview = {
  key: NBA_PROP_HUNT_MODE_KEY,
  label: NBA_PROP_HUNT_LABEL,
  tagline: 'Set a player prop line and pick Over or Under.',
  description:
    'Choose a player and stat, set the line, and everyone picks Over or Under. You can track from a starting-now baseline or the full game.',
  proposerConfiguration: [
    'Pick the player and stat (points, rebounds, assists, etc.).',
    'Choose whether to track from now (“Starting Now”) or use cumulative totals.',
    'Set the over/under line ending in .5.',
    'Pick when to resolve (Halftime or End of Game).',
  ],
  participantChoices: ['pass — skip', 'Over — stat beats the line', 'Under — stat falls short'],
  winningCondition:
    'Compare the tracked stat to the line at the chosen resolve time. If it exceeds the line, Over wins; if below, Under wins.',
  notes: ['Lines must end in .5 to avoid pushes.'],
};
