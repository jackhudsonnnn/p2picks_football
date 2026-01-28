import type { ModeOverview } from '../../../sharedUtils/types';

export const kingOfTheHillOverview: ModeOverview = {
  key: 'nba_king_of_the_hill',
  label: 'King Of The Hill (NBA)',
  tagline: 'First player to the target stat wins.',
  description:
    'King Of The Hill pits two players against a target. Set the stat, pick the players, choose the threshold, and decide whether to track from baselines (Starting Now) or full-game totals (Cumulative). First to hit the target wins.',
  proposerConfiguration: [
    'Select two unique players from the active game.',
    'Choose the stat to monitor (points, rebounds, assists, etc.).',
    'Pick the resolve value (the target number for the stat).',
    'Choose tracking mode: “Starting Now” (net gains) or “Cumulative” (total stats).',
  ],
  participantChoices: [
    'pass — sit this bet out.',
    'Player 1 — the first player selected by the proposer.',
    'Player 2 — the second player selected by the proposer.',
    'Neither — neither player reaches the target before game end.',
  ],
  winningCondition:
    'Whichever player reaches the target stat first wins. If both reach at the same moment, it is a tie. If neither reaches the target by game end, “Neither” wins.',
  notes: [
    '“Starting Now” captures baselines at pending time and measures gains; “Cumulative” ignores baselines and uses totals.',
    'If both hit on the same play/time, we fall back to metric comparison, then value comparison, then declare a tie.',
  ],
  example: {
    title: 'Example',
    description:
      'Jayson Tatum vs. Jimmy Butler — first to 30 points, tracking “Cumulative”. Whoever hits 30 total points first wins. If “Starting Now” were selected, the first to add 30 points after betting closes would win.',
  },
};
