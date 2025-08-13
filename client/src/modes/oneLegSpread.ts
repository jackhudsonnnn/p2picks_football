import { ModeDefinition, ModeContext } from './Mode';

export const oneLegSpreadMode: ModeDefinition = {
  key: 'one_leg_spread',
  label: '1 Leg Spread',
  winningChoices: ['0-3', '4-10', '11-25', '26+'],
  pickRandomWinner: (_ctx: ModeContext) => {
    const buckets = ['0-3', '4-10', '11-25', '26+'];
    return buckets[Math.floor(Math.random() * buckets.length)];
  },
};
