import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';
import { safeFetchJSON } from '@shared/utils/http';

export interface ScorcererConfig {
  baseline_touchdowns?: number | null;
  baseline_field_goals?: number | null;
  baseline_safeties?: number | null;
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

    let baseline_touchdowns: number | null = null;
    let baseline_field_goals: number | null = null;
    let baseline_safeties: number | null = null;
    let baseline_captured_at: string | null = null;

    if (gameId) {
      const base = import.meta.env.VITE_STATS_SERVER_URL;
      if (base) {
        const teamsUrl = `${base}/api/games/${encodeURIComponent(gameId)}/teams`;
        const teams = await safeFetchJSON<any[]>(teamsUrl, { previewBytes: 80 });
        if (Array.isArray(teams)) {
          let touchdownsSum = 0;
          let fieldGoalsSum = 0;
          let safetiesSum = 0;
          await Promise.all(
            teams.map(async (t: any) => {
              if (!t || !t.teamId) return;
              const scoreUrl = `${base}/api/games/${encodeURIComponent(gameId)}/team/${encodeURIComponent(t.teamId)}/score-stats`;
              const s = await safeFetchJSON<any>(scoreUrl, { previewBytes: 80 });
              if (s) {
                touchdownsSum += Number(s?.touchdowns || 0);
                fieldGoalsSum += Number(s?.fieldGoalsMade || 0);
                safetiesSum += Number(s?.safeties || 0);
              }
            })
          );
          baseline_touchdowns = touchdownsSum;
          baseline_field_goals = fieldGoalsSum;
          baseline_safeties = safetiesSum;
          baseline_captured_at = new Date().toISOString();
        }
      } else {
        console.warn('[scorcerer] VITE_STATS_SERVER_URL not set; skipping baseline capture');
      }
    }

    const payload = {
      bet_id: bet.bet_id,
      baseline_touchdowns,
      baseline_field_goals,
      baseline_safeties,
      baseline_captured_at,
    };
    const { error } = await supabase.from('bet_mode_scorcerer').insert([payload]);
    if (error) throw error;
  },
};
