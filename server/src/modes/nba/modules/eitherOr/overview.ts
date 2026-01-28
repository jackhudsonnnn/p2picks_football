import type { ModeOverview } from '../../../sharedUtils/types';

export const eitherOrOverview: ModeOverview = {
  key: 'nba_either_or',
  label: 'Either Or (NBA)',
  tagline: 'Pick which player surges in the selected stat.',
  description:
    'Either Or pits two hoopers against each other on a single stat. The proposer sets the matchup, the stat, and when the bet should settle. Participants back the player they believe will rack up the bigger number once the bet locks.',
  proposerConfiguration: [
    'Select two unique players from the active game.',
    'Choose the stat to monitor (points, rebounds, assists, 3PM, etc.).',
    'Set whether the wager resolves at halftime or end of game.',
    'Pick how progress should be tracked: “Starting Now” (net gains) or “Cumulative” (total stats).',
  ],
  participantChoices: [
    'pass — sit this bet out.',
    'Player 1 — the first player selected by the proposer.',
    'Player 2 — the second player selected by the proposer.',
  ],
  winningCondition:
    'At the selected settle time, compare the players based on the chosen tracking mode. “Starting Now” compares net gains after betting closes, while “Cumulative” compares total stats. The higher metric wins.',
  notes: [
    '“Starting Now” captures baselines as soon as the bet turns pending, while “Cumulative” always uses total stats.',
    'Participants can change their selection at any time while the bet remains active.',
  ],
  example: {
    title: 'Example',
    description:
      'Steph Curry vs. Damian Lillard in 3PM, resolving at halftime, with “Starting Now” selected. When halftime arrives, the system checks who gained the most made threes from the moment the bet became pending. If “Cumulative” had been selected, whoever has the most total made threes at halftime would win outright.',
  },
};
