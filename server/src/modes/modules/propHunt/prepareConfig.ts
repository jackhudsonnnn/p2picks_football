import type { BetProposal } from '../../../supabaseClient';
import { loadRefinedGame, findPlayer, type RefinedGameDoc } from '../../../helpers';
import { extractTeamId, extractTeamName, pickAwayTeam, pickHomeTeam } from '../../shared/utils';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT, PROP_HUNT_LINE_RANGE, STAT_KEY_LABELS, STAT_KEY_TO_CATEGORY } from './constants';

interface PropHuntConfig {
  nfl_game_id?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  player_team_name?: string | null;
  player_team?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  resolve_at?: string | null;
  line?: string | null;
  line_label?: string | null;
  line_value?: number | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  bet_id?: string | null;
  current_stat_value?: number | null;
}

const { min: LINE_MIN, max: LINE_MAX } = PROP_HUNT_LINE_RANGE;

export async function preparePropHuntConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const debug = isDebug();
  const next = { ...config } as PropHuntConfig;
  next.bet_id = next.bet_id ?? bet.bet_id ?? null;

  if (!next.nfl_game_id) {
    next.nfl_game_id = bet.nfl_game_id ?? null;
  }

  if (!next.resolve_at || !PROP_HUNT_ALLOWED_RESOLVE_AT.includes(String(next.resolve_at))) {
    next.resolve_at = PROP_HUNT_DEFAULT_RESOLVE_AT;
  }

  normalizeLine(next);
  normalizeStat(next);

  const gameId = next.nfl_game_id ? String(next.nfl_game_id) : '';
  if (!gameId) {
    return normalizeConfigPayload(next);
  }

  try {
    const doc = await loadRefinedGame(gameId);
    if (!doc) {
      return normalizeConfigPayload(next);
    }

    enrichWithTeamContext(next, doc);

    const currentStat = await getPlayerStatValue(doc, next.stat, {
      id: next.player_id,
      name: next.player_name,
    });

    if (debug) {
      console.log('[propHunt][prepareConfig] normalized config', {
        betId: bet.bet_id,
        stat: next.stat,
        currentStat,
      });
    }

    next.current_stat_value = currentStat ?? null;

    if (currentStat != null && next.line_value != null && next.line_value <= currentStat) {
      if (debug) {
        console.warn('[propHunt][prepareConfig] line not above current stat', {
          betId: bet.bet_id,
          line_value: next.line_value,
          currentStat,
        });
      }
    }

    return normalizeConfigPayload(next);
  } catch (err) {
    if (debug) {
      console.warn('[propHunt][prepareConfig] context load failed', {
        betId: bet.bet_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return normalizeConfigPayload(next);
  }
}

function normalizeConfigPayload(config: PropHuntConfig): Record<string, unknown> {
  return {
    bet_id: config.bet_id ?? null,
    nfl_game_id: config.nfl_game_id ?? null,
    player_id: config.player_id ?? null,
    player_name: config.player_name ?? null,
    player_team_name: config.player_team_name ?? config.player_team ?? null,
    player_team: config.player_team ?? config.player_team_name ?? null,
    stat: config.stat ?? null,
    stat_label: config.stat_label ?? null,
    resolve_at: config.resolve_at ?? null,
    line: config.line ?? null,
    line_label: config.line_label ?? null,
    line_value: config.line_value ?? null,
    home_team_id: config.home_team_id ?? null,
    home_team_name: config.home_team_name ?? null,
    away_team_id: config.away_team_id ?? null,
    away_team_name: config.away_team_name ?? null,
    current_stat_value: config.current_stat_value ?? null,
  };
}

function normalizeLine(config: PropHuntConfig): void {
  const raw = config.line_value ?? config.line;
  const numeric = toNumber(raw);
  if (numeric == null) {
    config.line = null;
    config.line_value = null;
    config.line_label = null;
    return;
  }
  if (numeric < LINE_MIN || numeric > LINE_MAX) {
    config.line = null;
    config.line_value = null;
    config.line_label = null;
    return;
  }
  const rounded = Math.round(numeric * 10) / 10;
  const scaled = Math.round(rounded * 2);
  if (!Number.isFinite(rounded) || !Number.isInteger(scaled) || Math.abs(scaled) % 2 !== 1) {
    config.line = null;
    config.line_value = null;
    config.line_label = null;
    return;
  }
  const normalized = scaled / 2;
  const label = normalized.toFixed(1);
  config.line_value = normalized;
  config.line_label = label;
  config.line = label;
}

function normalizeStat(config: PropHuntConfig): void {
  if (!config.stat) return;
  const key = String(config.stat);
  const label = STAT_KEY_LABELS[key];
  if (label) {
    config.stat_label = label;
  }
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[^0-9+\-.]/g, '');
    const num = Number.parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

type PlayerRef = { id?: string | null; name?: string | null };

async function getPlayerStatValue(doc: RefinedGameDoc, statKey: string | null | undefined, ref: PlayerRef): Promise<number | null> {
  if (!statKey) return null;
  const category = STAT_KEY_TO_CATEGORY[String(statKey)];
  if (!category) return null;
  const player = lookupPlayer(doc, ref);
  if (!player) return null;
  const stats = ((player as any).stats || {}) as Record<string, Record<string, unknown>>;
  const categoryStats = stats ? (stats[category] as Record<string, unknown>) : undefined;
  if (!categoryStats) return null;
  return normalizeStatValue(categoryStats[String(statKey)]);
}

function lookupPlayer(doc: RefinedGameDoc, ref: PlayerRef) {
  if (ref.id) {
    const byId = findPlayer(doc, String(ref.id));
    if (byId) return byId;
  }
  if (ref.name) {
    const byName = findPlayer(doc, `name:${ref.name}`);
    if (byName) return byName;
  }
  return null;
}

function normalizeStatValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const first = raw.split('/')[0];
    const num = Number(first);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function enrichWithTeamContext(config: PropHuntConfig, doc: RefinedGameDoc): void {
  const homeTeam = pickHomeTeam(doc);
  const awayTeam = pickAwayTeam(doc, homeTeam);

  if (!config.home_team_id) {
    config.home_team_id = extractTeamId(homeTeam);
  }
  if (!config.home_team_name) {
    config.home_team_name = extractTeamName(homeTeam);
  }
  if (!config.away_team_id) {
    config.away_team_id = extractTeamId(awayTeam);
  }
  if (!config.away_team_name) {
    config.away_team_name = extractTeamName(awayTeam);
  }
}

function isDebug(): boolean {
  return process.env.DEBUG_PROP_HUNT === '1' || process.env.DEBUG_PROP_HUNT === 'true';
}
