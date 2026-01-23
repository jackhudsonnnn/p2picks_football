import type { BetProposal } from '../../../supabaseClient';
import {
  getHomeTeam,
  getAwayTeam,
  getPlayerStat,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../services/nflData/nflRefinedDataAccessors';
import { normalizeResolveAt } from '../../shared/resolveUtils';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT, PROP_HUNT_LINE_RANGE, STAT_KEY_LABELS, STAT_KEY_TO_CATEGORY } from './constants';
import { type PlayerRef } from '../../shared/playerUtils';

interface PropHuntConfig {
  league_game_id?: string | null;
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
  home_team_abbrev?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  away_team_abbrev?: string | null;
  bet_id?: string | null;
  current_stat_value?: number | null;
  progress_mode?: string | null;
}

const { min: LINE_MIN, max: LINE_MAX } = PROP_HUNT_LINE_RANGE;

export async function preparePropHuntConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const next = { ...config } as PropHuntConfig;
  next.bet_id = next.bet_id ?? bet.bet_id ?? null;

  if (!next.league_game_id) {
		next.league_game_id = bet.league_game_id ?? null;
  }

  next.resolve_at = normalizeResolveAt(next.resolve_at, PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT);

  normalizeLine(next);
  normalizeStat(next);
  next.progress_mode = normalizeProgressMode(next.progress_mode);

  const gameId = next.league_game_id ? String(next.league_game_id) : '';
  if (!gameId) {
    return normalizeConfigPayload(next);
  }

  try {
    await enrichWithTeamContext(next, gameId);

    const currentStat = await fetchPlayerStat(gameId, next.stat, {
      id: next.player_id,
      name: next.player_name,
    });

    next.current_stat_value = currentStat ?? null;
    return normalizeConfigPayload(next);
  } catch (err) {
    return normalizeConfigPayload(next);
  }
}

function normalizeConfigPayload(config: PropHuntConfig): Record<string, unknown> {
  return {
    bet_id: config.bet_id ?? null,
    league_game_id: config.league_game_id ?? null,
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
    home_team_abbrev: config.home_team_abbrev ?? null,
    away_team_id: config.away_team_id ?? null,
    away_team_name: config.away_team_name ?? null,
    away_team_abbrev: config.away_team_abbrev ?? null,
    current_stat_value: config.current_stat_value ?? null,
    progress_mode: normalizeProgressMode(config.progress_mode),
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

async function fetchPlayerStat(gameId: string, statKey: string | null | undefined, ref: PlayerRef): Promise<number | null> {
  if (!statKey) return null;
  const category = STAT_KEY_TO_CATEGORY[String(statKey)];
  if (!category) return null;
  const key = resolvePlayerKey(ref.id, ref.name);
  if (!key) return null;
  const value = await getPlayerStat(gameId, key, category, String(statKey));
  return normalizeStatValue(value);
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

function resolvePlayerKey(id?: string | null, name?: string | null): string | null {
  const trimmedId = id ? String(id).trim() : '';
  if (trimmedId) return trimmedId;
  const trimmedName = name ? String(name).trim() : '';
  if (trimmedName) return `name:${trimmedName}`;
  return null;
}

async function enrichWithTeamContext(config: PropHuntConfig, gameId: string): Promise<void> {
  const homeTeam = await getHomeTeam(gameId);
  const awayTeam = await getAwayTeam(gameId);

  if (!config.home_team_id) {
    config.home_team_id = extractTeamId(homeTeam);
  }
  if (!config.home_team_name) {
    config.home_team_name = extractTeamName(homeTeam);
  }
  if (!config.home_team_abbrev) {
    config.home_team_abbrev = extractTeamAbbreviation(homeTeam);
  }
  if (!config.away_team_id) {
    config.away_team_id = extractTeamId(awayTeam);
  }
  if (!config.away_team_name) {
    config.away_team_name = extractTeamName(awayTeam);
  }
  if (!config.away_team_abbrev) {
    config.away_team_abbrev = extractTeamAbbreviation(awayTeam);
  }
}

function normalizeProgressMode(value: unknown): 'starting_now' | 'cumulative' {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'cumulative') {
    return 'cumulative';
  }
  return 'starting_now';
}
