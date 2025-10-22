import type { ModeOverview } from '../../shared/types';

export const eitherOrOverview: ModeOverview = {
  key: 'either_or',
  label: 'Either Or',
  tagline: 'Pick which player surges in the selected stat.',
  description:
    'Either Or is a prop bet that pits two players against each other. The proposer nominates the matchup, the tracked stat, and when the bet should settle. Participants back the player they believe will generate the largest increase once the bet locks.',
  proposerConfiguration: [
    'Select two unique players from the active game.',
    'Choose the stat to monitor (receptions, receiving yards, punts, etc.).',
    'Set whether the wager resolves at halftime or at the end of the game.'
  ],
  participantChoices: [
    'pass — sit this bet out.',
    'Player 1 — the first player selected by the proposer.',
    'Player 2 — the second player selected by the proposer.'
  ],
  winningCondition:
    'When the settle time is reached, compare each player’s stat total to the baseline captured when the bet moved to pending. The player with the largest net increase wins.',
  notes: [
    'The baseline for the tracked stat is captured the moment the bet becomes pending.',
    'Participants can change their selection at any time while the bet remains active.'
  ],
  example: {
    title: 'Example',
    description:
      'Tom Brady vs. Peyton Manning in passing yards, resolving at halftime, with the bet proposed mid first quarter. When halftime arrives, the system checks which quarterback gained the most passing yards from the moment the bet became pending. That player’s backers win.'
  }
};
