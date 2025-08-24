import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';

export interface OneLegSpreadConfig {}

export const oneLegSpreadMode: ModeDefinition = {
  key: 'one_leg_spread',
  label: '1 Leg Spread',
  summary: () => '1 Leg Spread',
  options: () => ['pass', '0-3', '4-10', '11-25', '26+'],
  buildDescription: () => '1 Leg Spread — final absolute point spread bucket',
  persistConfig: async ({ bet }) => {
    const { error } = await supabase.from('bet_mode_one_leg_spread').insert([{ bet_id: bet.bet_id }]);
    if (error) throw error;
  },
};
