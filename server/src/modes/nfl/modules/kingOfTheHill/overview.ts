import type { ModeOverview } from '../../../sharedUtils/types';

export const kingOfTheHillOverview: ModeOverview = {
  key: 'king_of_the_hill',
  label: 'King Of The Hill',
  tagline: 'Race two players to a stat milestone.',
  description:
    'King Of The Hill pits two players in a sprint to a stat threshold. The proposer selects the matchup, the tracked stat, and the milestone value. Participants back the player they believe will reach the target first—or bet that neither will get there before the final whistle.',
  proposerConfiguration: [
    'Select two unique players from the active game.',
    'Choose the stat to monitor (passing yards, receptions, tackles, etc.).',
    'Set the resolve value between 1 and 499 that the players are racing to hit.',
    'Choose how progress is tracked: “Starting Now” captures baselines at lock, “Cumulative” uses total game stats.',
  ],
  participantChoices: [
    'pass — sit this bet out.',
    'Player 1 — the first player selected by the proposer.',
    'Player 2 — the second player selected by the proposer.',
    'Neither — win if the game ends before either player hits the resolve value.',
  ],
  winningCondition:
    'With “Starting Now,” baselines are captured the moment betting closes and players race to add the resolve value from that snapshot. With “Cumulative,” the first player to reach the resolve value in total stats wins. If the game ends before anyone hits their target, “Neither” wins.',
  notes: [
    'Your progress tracking selection determines whether baselines are used or totals are compared directly.',
    'If both players cross the resolve value on the same update, the wager washes.',
    'Participants can change their selection at any time while the bet remains active.',
  ],
  example: {
    title: 'Example',
    description:
      'Tom Brady vs. Peyton Manning racing to “first to 3 passing TDs” with “Starting Now” selected. When the ticket becomes pending, Brady has 1 TD and Manning has 2 TDs, so Brady now needs 4 total TDs and Manning needs 5. If the proposer had picked “Cumulative,” the first quarterback to reach 3 total TDs overall would have won immediately.',
  },
};
