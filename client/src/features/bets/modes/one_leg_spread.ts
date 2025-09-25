import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';

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
      try {
        const base = (import.meta as any)?.env?.VITE_STATS_SERVER_URL;
        const resp = await fetch(`${base}/api/games/${encodeURIComponent(gameId)}/teams`);
        if (resp.ok) {
          const teams = await resp.json();
          // Prefer existing config values; otherwise use teams array: first=home, second=away
          if ((!payload.home_team_id || !payload.home_team_name) && Array.isArray(teams) && teams.length >= 1) {
            const t = teams[0];
            payload.home_team_id = payload.home_team_id || t.teamId || t.abbreviation || null;
            payload.home_team_name = payload.home_team_name || t.displayName || null;
          }
          if ((!payload.away_team_id || !payload.away_team_name) && Array.isArray(teams) && teams.length >= 2) {
            const t = teams[1];
            payload.away_team_id = payload.away_team_id || t.teamId || t.abbreviation || null;
            payload.away_team_name = payload.away_team_name || t.displayName || null;
          }
        } else {
          console.warn('[one_leg_spread] teams API returned not-ok', { gameId, status: resp.status });
        }
      } catch (e) {
        console.warn('[one_leg_spread] failed to fetch teams', { gameId, err: e });
      }
    }

    const { error } = await supabase.from('bet_mode_one_leg_spread').insert([payload]);
    if (error) throw error;
  },
};
