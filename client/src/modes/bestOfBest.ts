import { ModeDefinition, ModeContext } from './Mode';

export const bestOfBestMode: ModeDefinition = {
  key: 'best_of_best',
  label: 'Best of the Best',
  // Participants pick player1 or player2 (or pass which is not a winning choice)
  winningChoices: ['player1', 'player2'],
  pickRandomWinner: (_ctx: ModeContext) => {
    // Randomly pick between player1 or player2
    return Math.random() < 0.5 ? 'player1' : 'player2';
  },
};
