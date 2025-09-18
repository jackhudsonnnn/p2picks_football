import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';

export interface ScorcererConfig {
  // Optionally capture baseline scoreboard at creation
  baseline_home_score?: number | null;
  baseline_away_score?: number | null;
  baseline_captured_at?: string | null;
}

export const scorcererMode: ModeDefinition = {
  key: 'scorcerer',
  label: 'Scorcerer',
  summary: () => 'Scorcerer • next score type',
  options: () => ['pass', 'TD', 'FG', 'Safety', 'No More Scores'],
  buildDescription: () => 'Predict the next scoring play type in this game',
  winningConditionText: () =>
    'Winning choice is the next score type after proposal time: TD, FG, Safety, or No More Scores if the game ends without another score.',
  persistConfig: async ({ bet }) => {
    const gameId: string | undefined = (bet as any)?.nfl_game_id || undefined;

    let baseline_home_score: number | null = null;
    let baseline_away_score: number | null = null;
    let baseline_captured_at: string | null = null;

    // Best-effort try to capture current score from stats server; proceed if unavailable
    if (gameId) {
      try {
        const base = (import.meta as any)?.env?.VITE_STATS_SERVER_URL || 'http://localhost:5001';
        const resp = await fetch(`${base}/api/games/${encodeURIComponent(gameId)}/scoreboard`);
        if (resp.ok) {
          const sb = await resp.json();
          const hs = Number((sb?.homeScore ?? sb?.home_points));
          const as = Number((sb?.awayScore ?? sb?.away_points));
          baseline_home_score = Number.isFinite(hs) ? hs : null;
          baseline_away_score = Number.isFinite(as) ? as : null;
          baseline_captured_at = new Date().toISOString();
        }
      } catch {
        // ignore
      }
    }

    const payload = {
      bet_id: bet.bet_id,
      baseline_home_score,
      baseline_away_score,
      baseline_captured_at,
    };
    const { error } = await supabase.from('bet_mode_scorcerer').insert([payload]);
    if (error) throw error;
  },
};
