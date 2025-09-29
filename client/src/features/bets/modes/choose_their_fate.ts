import { supabase } from "@shared/api/supabaseClient";
import { ModeDefinition } from "./base";
import { safeFetchJSON } from "@shared/utils/http";

export interface ChooseTheirFateConfig {
  // capture possession metadata if available at creation time
  possession_team_id?: string | null;
  possession_team_name?: string | null;
  possession_down?: number | null;
  possession_distance?: number | null;
  possession_field_position?: string | null;
  baseline_captured_at?: string | null;
}

export const chooseTheirFateMode: ModeDefinition = {
  key: "choose_their_fate",
  label: "Choose their Fate",
  summary: () => "Choose their Fate • current drive outcome",
  options: () => ["pass", "TD", "FG", "Turnover"],
  buildDescription: () =>
    "Predict the outcome of the current possession: TD, FG, or Turnover",
  winningConditionText: () =>
    "Winning choice is the final result of the current possession that is active at proposal time: TD, FG, or Turnover.",
  persistConfig: async ({ bet }) => {
    const gameId: string | undefined = (bet as any)?.nfl_game_id || undefined;
    const payload: any = { bet_id: bet.bet_id };

    // Best-effort pull current possession metadata
    if (gameId) {
      const base = import.meta.env.VITE_STATS_SERVER_URL;
      if (base) {
        const url = `${base}/api/games/${encodeURIComponent(gameId)}/possession`;
        const pos = await safeFetchJSON<any>(url, { previewBytes: 80 });
        if (pos) {
          payload.possession_team_id = pos?.teamId ?? pos?.team_id ?? null;
          payload.possession_team_name = pos?.teamName ?? pos?.team_name ?? null;
          payload.baseline_captured_at = new Date().toISOString();
        }
      } else {
        console.warn('[choose_their_fate] VITE_STATS_SERVER_URL not set; skipping possession baseline');
      }
    }

    const { error } = await supabase
      .from("bet_mode_choose_their_fate")
      .insert([payload]);
    if (error) throw error;
  },
};
