import { useEffect, useMemo, useState } from "react";
import { supabase } from "@shared/api/supabaseClient";
import { ModeDefinition, ModeStepRenderer } from "./base";
import { useGamePlayers } from "@shared/hooks/useGamePlayers";

export interface BestOfBestConfig {
  player1_id?: string;
  player1_name?: string;
  player2_id?: string;
  player2_name?: string;
  stat?: string;
  stat_label?: string;
  resolve_after?: "Q1 ends" | "Q2 ends" | "Q3 ends" | "Q4 ends";
}

// Map each supported stat key to the stats server category it belongs to.
// This is needed to query the correct endpoint when capturing baselines.
const STAT_KEY_TO_CATEGORY: Record<string, string> = {
  // Passing
  passingYards: "passing",
  passingTouchdowns: "passing",
  // Rushing
  rushingYards: "rushing",
  rushingTouchdowns: "rushing",
  longRushing: "rushing",
  // Receiving
  receptions: "receiving",
  receivingYards: "receiving",
  receivingTouchdowns: "receiving",
  longReception: "receiving",
  // Defensive
  totalTackles: "defensive",
  sacks: "defensive",
  passesDefended: "defensive",
  // Interceptions
  interceptions: "interceptions",
  // Returns
  kickReturnYards: "kickReturns",
  longKickReturn: "kickReturns",
  puntReturnYards: "puntReturns",
  longPuntReturn: "puntReturns",
  // Punting
  puntsInside20: "punting",
  longPunt: "punting",
};

// Step 1: Player selection (Player 1 & Player 2)
const BestOfBestPlayersStep: ModeStepRenderer = ({ value, onChange, game }) => {
  const { players, loading, error } = useGamePlayers(game?.id);
  const selectablePlayers = useMemo(() => players, [players]);

  return (
    <div className="form-step">
      {loading && <div className="form-hint">Loading players…</div>}
      {error && <div className="form-error">{error}</div>}
      <div className="form-group">
        <label className="form-label">Player 1</label>
        <select
          className="form-select"
          value={value.player1_id || ""}
          onChange={(e) => {
            const id = e.target.value;
            const pl = selectablePlayers.find(
              (p: any) => String(p.id) === String(id)
            );
            onChange({ player1_id: id || undefined, player1_name: pl?.name });
          }}
        >
          <option value="">Select Player</option>
          {selectablePlayers.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Player 2</label>
        <select
          className="form-select"
          value={value.player2_id || ""}
          onChange={(e) => {
            const id = e.target.value;
            const pl = selectablePlayers.find(
              (p: any) => String(p.id) === String(id)
            );
            onChange({ player2_id: id || undefined, player2_name: pl?.name });
          }}
        >
          <option value="">Select Player</option>
          {selectablePlayers
            .filter((p: any) => String(p.id) !== String(value.player1_id || ""))
            .map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
};

// Step 2: Stat and Resolve After selection
const BestOfBestStatResolveStep: ModeStepRenderer = ({
  value,
  onChange,
  allowedResolveAfter,
}) => {
  // Stats the product wants to allow for Best of the Best
  const allowedStatKeys = useMemo(
    () => [
      "passingYards",
      "passingTouchdowns",
      "rushingYards",
      "rushingTouchdowns",
      "longRushing",
      "receptions",
      "receivingYards",
      "receivingTouchdowns",
      "longReception",
      "totalTackles",
      "sacks",
      "passesDefended",
      "interceptions",
      "kickReturnYards",
      "longKickReturn",
      "puntReturnYards",
      "longPuntReturn",
      "puntsInside20",
      "longPunt",
    ],
    []
  );

  type StatOption = { key: string; label: string; mode: string };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statOptions, setStatOptions] = useState<StatOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        
        const base = import.meta.env.VITE_STATS_SERVER_URL;
        if (!base) {
          throw new Error(
            "VITE_STATS_SERVER_URL is not defined – set it in your .env file"
          );
        }

        async function fetchJSON(url: string) {
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(
              `Failed (${res.status}) fetching ${url} :: ${text.slice(0,140)}`
            );
          }
          const ct = res.headers.get("content-type") || "";
          const raw = await res.text();
            // Some dev servers return HTML (index.html) for unmatched routes – catch that early
          if (!ct.includes("application/json") || raw.trim().startsWith("<!DOCTYPE") || raw.trim().startsWith("<html")) {
            throw new Error(
              `Non-JSON response from ${url}. content-type='${ct}'. First chars: '${raw.trim().slice(0,60)}'`
            );
          }
          try {
            return JSON.parse(raw);
          } catch (e: any) {
            throw new Error(
              `JSON parse error for ${url}: ${e?.message}. First chars: '${raw.slice(0,80)}'`
            );
          }
        }
        // Modes available on server that contain the keys we care about
        const modes = [
          "passing",
          "rushing",
          "receiving",
          "defensive",
          "interceptions",
          "kickReturns",
          "puntReturns",
          "punting",
        ];
        const results = await Promise.all(
          modes.map(async (m) => {
            const url = `${base}/api/modes/${m}`;
            const obj = await fetchJSON(url);
            return { mode: m, obj } as const;
          })
        );

        const options: StatOption[] = [];
        for (const { mode, obj } of results) {
          for (const [key, label] of Object.entries(obj as Record<string, string>)) {
            if (!allowedStatKeys.includes(key)) continue;
            options.push({ key, label, mode });
          }
        }
        const byKey: Record<string, StatOption[]> = {};
        for (const o of options) {
          byKey[o.key] ||= [];
          byKey[o.key].push(o);
        }
        const chosen: StatOption[] = [];
        for (const [key, opts] of Object.entries(byKey)) {
          const pref = STAT_KEY_TO_CATEGORY[key];
          const match = opts.find((o) => o.mode === pref) || opts[0];
          chosen.push(match);
        }
        const finalOptions = chosen.sort((a, b) => a.label.localeCompare(b.label));
        if (!cancelled) setStatOptions(finalOptions);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [allowedStatKeys]);

  const quarters =
    allowedResolveAfter && allowedResolveAfter.length
      ? allowedResolveAfter
      : ["Q1 ends", "Q2 ends", "Q3 ends", "Q4 ends"];
  return (
    <div className="form-step">
      {loading && <div className="form-hint">Loading stat options…</div>}
      {error && <div className="form-error">{error}</div>}
      <div className="form-group">
        <label className="form-label">Stat</label>
        <select
          className="form-select"
          value={value.stat || ""}
          onChange={(e) => {
            const key = e.target.value;
            const opt = statOptions.find((o) => o.key === key);
            onChange({ stat: key || undefined, stat_label: opt?.label });
          }}
        >
          <option value="">Select Stat</option>
          {statOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Resolve After</label>
        <select
          className="form-select"
          value={value.resolve_after || ""}
          onChange={(e) => onChange({ resolve_after: e.target.value })}
        >
          <option value="">Select Quarter</option>
          {quarters.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export const bestOfBestMode: ModeDefinition = {
  key: "best_of_best",
  label: "Best of the Best",
  summary: ({ config }) => {
    if (!config) return "Best of the Best";
  const { stat, stat_label, resolve_after } = config as BestOfBestConfig;
  const statText = stat_label || stat || "";
  return `Best of the Best • ${statText} • ${resolve_after || ""}`.trim();
  },
  options: ({ config, bet }) => {
    const c = (config as BestOfBestConfig) || {};
    // Derive player names from config first, else from bet payload
    let p1 = c.player1_name;
    let p2 = c.player2_name;
    if ((!p1 || !p2) && bet && (bet as any).bet_mode_best_of_best) {
      const cfg = Array.isArray((bet as any).bet_mode_best_of_best)
        ? (bet as any).bet_mode_best_of_best[0]
        : (bet as any).bet_mode_best_of_best;
      p1 = p1 || cfg?.player1_name;
      p2 = p2 || cfg?.player2_name;
    }
    return ["pass", ...(p1 ? [p1] : []), ...(p2 ? [p2] : [])];
  },
  buildDescription: (c: BestOfBestConfig) =>
    {
      const p1 = c.player1_name || c.player1_id || "Player 1";
      const p2 = c.player2_name || c.player2_id || "Player 2";
  const statText = c.stat_label || c.stat || "stat";
  return `${p1} vs ${p2} largest increase in ${statText} until ${
        c.resolve_after || "selected time"
      }`;
    },
  buildSecondaryDescription: (c: BestOfBestConfig) => {
    const p1 = c.player1_name || c.player1_id;
    const p2 = c.player2_name || c.player2_id;
    if (!p1 && !p2) return undefined;
    return `${p1 || "Player 1"} vs ${p2 || "Player 2"}`;
  },
  validateConfig: (c: BestOfBestConfig) => {
    const errs: string[] = [];
    if (!c.player1_id) errs.push("Player 1 required");
    if (!c.player2_id) errs.push("Player 2 required");
    if (
      c.player1_id &&
      c.player2_id &&
      String(c.player1_id) === String(c.player2_id)
    )
      errs.push("Players must differ");
    if (!c.stat) errs.push("Stat required");
    if (!c.resolve_after) errs.push("Resolve after required");
    if (errs.length) throw new Error(errs.join("; "));
  },
  persistConfig: async ({ bet, config }) => {
    const c = config as BestOfBestConfig;
    const gameId = (bet as any)?.nfl_game_id as string | undefined;
    const statKey = c.stat as string | undefined;
    const category = statKey ? STAT_KEY_TO_CATEGORY[statKey] : undefined;

    // Attempt to capture baseline stats for both players at creation time
    let baseline_player1: number | null = null;
    let baseline_player2: number | null = null;
    let baseline_captured_at: string | null = null;

    if (gameId && category && (c.player1_id || c.player1_name) && (c.player2_id || c.player2_name)) {
      try {
  const base = import.meta.env.VITE_STATS_SERVER_URL;
        if (base) {
          async function safeFetch(url: string) {
            try {
              const res = await fetch(url, { headers: { Accept: "application/json" } });
              if (!res.ok) return {};
              const ct = res.headers.get("content-type") || "";
              const text = await res.text();
              if (!ct.includes("application/json") || text.trim().startsWith("<")) {
                console.warn("Baseline fetch non-JSON", { url, ct, preview: text.slice(0,80) });
                return {};
              }
              try {
                return JSON.parse(text);
              } catch (e) {
                console.warn("Baseline JSON parse error", { url, error: (e as any)?.message });
                return {};
              }
            } catch (e) {
              console.warn("Baseline fetch failed", { url, error: (e as any)?.message });
              return {};
            }
          }
          const p1 = c.player1_id || (c.player1_name ? `name:${c.player1_name}` : undefined);
          const p2 = c.player2_id || (c.player2_name ? `name:${c.player2_name}` : undefined);
          const [s1, s2] = await Promise.all([
            p1 ? safeFetch(`${base}/api/games/${gameId}/player/${encodeURIComponent(p1)}/${encodeURIComponent(category)}`) : Promise.resolve({}),
            p2 ? safeFetch(`${base}/api/games/${gameId}/player/${encodeURIComponent(p2)}/${encodeURIComponent(category)}`) : Promise.resolve({}),
          ]);
          const v1 = (s1 as any)?.[statKey!];
          const v2 = (s2 as any)?.[statKey!];
          baseline_player1 = typeof v1 === "number" ? v1 : Number.isFinite(Number(v1)) ? Number(v1) : null;
          baseline_player2 = typeof v2 === "number" ? v2 : Number.isFinite(Number(v2)) ? Number(v2) : null;
          baseline_captured_at = new Date().toISOString();
        }
      } catch (e) {
        console.warn("Failed capturing baselines", e);
      }
    }
    const payload = {
      bet_id: bet.bet_id,
      player1_name: c.player1_name,
      player1_id: c.player1_id,
      player2_name: c.player2_name,
      player2_id: c.player2_id,
      stat: c.stat,
      resolve_after: c.resolve_after,
      baseline_player1,
      baseline_player2,
      baseline_captured_at,
    };
    const { error } = await supabase
      .from("bet_mode_best_of_best")
      .insert([payload]);
    if (error) throw error;
  },
  FormSteps: [
    {
      key: "players",
      render: BestOfBestPlayersStep,
      validate: (c: BestOfBestConfig) => {
        const errs: string[] = [];
        if (!c.player1_id) errs.push("Player 1 required");
        if (!c.player2_id) errs.push("Player 2 required");
        if (
          c.player1_id &&
          c.player2_id &&
          String(c.player1_id) === String(c.player2_id)
        )
          errs.push("Players must differ");
        if (errs.length) throw new Error(errs.join("; "));
      },
    },
    {
      key: "stat_resolve",
      render: BestOfBestStatResolveStep,
      validate: (c: BestOfBestConfig) => {
        const errs: string[] = [];
        if (!c.stat) errs.push("Stat required");
        if (!c.resolve_after) errs.push("Resolve after required");
        if (errs.length) throw new Error(errs.join("; "));
      },
    },
  ],
  winningConditionText: (c: BestOfBestConfig) => {
    const p1 = c.player1_name || c.player1_id || "Player 1";
    const p2 = c.player2_name || c.player2_id || "Player 2";
    const stat = c.stat_label || c.stat || "stat";
    const until = c.resolve_after || "selected time";
    return `${p1} vs ${p2} largest increase in ${stat} until ${until}`;
  },
};
