import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';

export interface ChooseTheirFateConfig {
  // capture possession metadata if available at creation time
  possession_team_id?: string | null;
  possession_team_name?: string | null;
  possession_down?: number | null;
  possession_distance?: number | null;
  possession_field_position?: string | null; // e.g., 'OWN 35'
  baseline_captured_at?: string | null;
}

export const chooseTheirFateMode: ModeDefinition = {
  key: 'choose_their_fate',
  label: 'Choose their Fate',
  summary: () => 'Choose their Fate • current drive outcome',
  options: () => ['pass', 'TD', 'FG', 'Turnover'],
  buildDescription: () => 'Predict the outcome of the current possession: TD, FG, or Turnover',
  winningConditionText: () =>
    'Winning choice is the final result of the current possession that is active at proposal time: TD, FG, or Turnover.',
  persistConfig: async ({ bet }) => {
    const gameId: string | undefined = (bet as any)?.nfl_game_id || undefined;
    const payload: any = { bet_id: bet.bet_id };

    // Best-effort pull current possession metadata
    if (gameId) {
      try {
        const base = (import.meta as any)?.env?.VITE_STATS_SERVER_URL || 'http://localhost:5001';
        const resp = await fetch(`${base}/api/games/${encodeURIComponent(gameId)}/possession`);
        if (resp.ok) {
          const pos = await resp.json();
          payload.possession_team_id = pos?.teamId ?? pos?.team_id ?? null;
          payload.possession_team_name = pos?.teamName ?? pos?.team_name ?? null;
          payload.possession_down = Number.isFinite(Number(pos?.down)) ? Number(pos.down) : null;
          payload.possession_distance = Number.isFinite(Number(pos?.distance)) ? Number(pos.distance) : null;
          payload.possession_field_position = pos?.fieldPosition ?? null;
          payload.baseline_captured_at = new Date().toISOString();
        }
      } catch {
        // ignore network errors
      }
    }

    const { error } = await supabase.from('bet_mode_choose_their_fate').insert([payload]);
    if (error) throw error;
  },
};
