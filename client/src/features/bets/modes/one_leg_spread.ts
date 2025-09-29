import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';
import { safeFetchJSON } from '@shared/utils/http';

export interface OneLegSpreadConfig {
  home_team_id?: string;
  home_team_name?: string;
  away_team_id?: string;
  away_team_name?: string;
}

export const oneLegSpreadMode: ModeDefinition = {
  key: 'one_leg_spread',
  label: '1 Leg Spread',
  summary: () => '1 Leg Spread',
  options: () => ['pass', '0-3', '4-10', '11-25', '26+'],
  buildDescription: () => 'Final absolute point spread bucket',
  persistConfig: async ({ bet, config }) => {
    const c = (config as OneLegSpreadConfig) || {};
    const payload: any = {
      bet_id: bet.bet_id,
      home_team_id: c.home_team_id ?? null,
      home_team_name: c.home_team_name ?? null,
      away_team_id: c.away_team_id ?? null,
      away_team_name: c.away_team_name ?? null,
    };

    // If nfl_game_id is provided, try to fetch teams from the server and fill missing values
    const gameId = (c as any).nfl_game_id || (bet as any).nfl_game_id;
    if (gameId) {
      const base = import.meta.env.VITE_STATS_SERVER_URL;
      if (base) {
        const url = `${base}/api/games/${encodeURIComponent(gameId)}/teams`;
        const teams = await safeFetchJSON<any[]>(url, { previewBytes: 80 });
        if (Array.isArray(teams)) {
          if ((!payload.home_team_id || !payload.home_team_name) && teams.length >= 1) {
            const t = teams[0];
            payload.home_team_id = payload.home_team_id || t.teamId || t.abbreviation || null;
            payload.home_team_name = payload.home_team_name || t.displayName || null;
          }
          if ((!payload.away_team_id || !payload.away_team_name) && teams.length >= 2) {
            const t = teams[1];
            payload.away_team_id = payload.away_team_id || t.teamId || t.abbreviation || null;
            payload.away_team_name = payload.away_team_name || t.displayName || null;
          }
        }
      } else {
        console.warn('[one_leg_spread] VITE_STATS_SERVER_URL not set; skipping teams enrichment');
      }
    }

    const { error } = await supabase.from('bet_mode_one_leg_spread').insert([payload]);
    if (error) throw error;
  },
};
