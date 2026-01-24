import type { ModeOverview } from '../../../sharedUtils/types';

export const eitherOrOverview: ModeOverview = {
  key: 'either_or',
  label: 'Either Or',
  tagline: 'Pick which player surges in the selected stat.',
  description:
    'Either Or is a prop bet that pits two players against each other. The proposer nominates the matchup, the tracked stat, and when the bet should settle. Participants back the player they believe will generate the largest increase once the bet locks.',
  proposerConfiguration: [
    'Select two unique players from the active game.',
    'Choose the stat to monitor (receptions, receiving yards, punts, etc.).',
    'Set whether the wager resolves at halftime or at the end of the game.',
    'Pick how progress should be tracked: “Starting Now” (net gains) or “Cumulative” (total stats).'
  ],
  participantChoices: [
    'pass — sit this bet out.',
    'Player 1 — the first player selected by the proposer.',
    'Player 2 — the second player selected by the proposer.'
  ],
  winningCondition:
    'At the selected settle time, compare the players based on the chosen tracking mode. “Starting Now” compares net gains since betting closed, while “Cumulative” compares total stats outright. The higher metric wins.',
  notes: [
    '“Starting Now” captures baselines as soon as the bet turns pending, while “Cumulative” always uses total stats.',
    'Participants can change their selection at any time while the bet remains active.'
  ],
  example: {
    title: 'Example',
    description:
      'Tom Brady vs. Peyton Manning in passing yards, resolving at halftime, with “Starting Now” selected. When halftime arrives, the system checks which quarterback gained the most passing yards from the moment the bet became pending. If “Cumulative” had been selected instead, the quarterback with the higher total yards at halftime would win outright.'
  }
};
