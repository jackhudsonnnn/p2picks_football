import type { BetProposal } from '../../../../supabaseClient';
import { getHomeTeam, getAwayTeam } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import {
  NBA_KOTH_DEFAULT_RESOLVE_VALUE,
  NBA_KOTH_STAT_KEY_LABELS,
  NBA_KOTH_STAT_KEY_TO_CATEGORY,
  clampResolveValue,
} from './constants';

export async function prepareKingOfTheHillConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const cfg = { ...config } as Record<string, unknown> & {
    league_game_id?: string | null;
    player1_id?: string | null;
    player1_name?: string | null;
    player2_id?: string | null;
    player2_name?: string | null;
    stat?: string | null;
    stat_label?: string | null;
    resolve_value?: number | null;
    resolve_value_label?: string | null;
    progress_mode?: string | null;
    home_team_id?: string | null;
    home_team_name?: string | null;
    home_team_abbrev?: string | null;
    away_team_id?: string | null;
    away_team_name?: string | null;
    away_team_abbrev?: string | null;
  };

  if (!cfg.league_game_id) cfg.league_game_id = bet.league_game_id ?? null;
  const league: League = bet.league ?? 'NBA';

  cfg.progress_mode = normalizeProgressMode(cfg.progress_mode);

  const statKey = cfg.stat ? String(cfg.stat) : '';
  const statLabel = statKey ? NBA_KOTH_STAT_KEY_LABELS[statKey] || cfg.stat_label || statKey : cfg.stat_label || null;
  const resolveValue = normalizeResolveValue(cfg.resolve_value ?? cfg.resolve_value_label);

  try {
    await enrichWithTeamContext(cfg, league, String(cfg.league_game_id ?? ''));
  } catch (err) {
    // non-blocking
  }

  return {
    ...normalizeConfigPayload(cfg),
    bet_id: bet.bet_id,
    stat_label: statLabel,
    resolve_value: resolveValue,
    resolve_value_label: resolveValue != null ? String(resolveValue) : null,
  } as Record<string, unknown>;
}

function normalizeConfigPayload(config: Record<string, unknown>) {
  return {
    bet_id: config.bet_id ?? null,
    league_game_id: config.league_game_id ?? null,
    player1_id: config.player1_id ?? null,
    player1_name: config.player1_name ?? null,
    player2_id: config.player2_id ?? null,
    player2_name: config.player2_name ?? null,
    stat: config.stat ?? null,
    stat_label: config.stat_label ?? null,
    resolve_value: normalizeResolveValue(config.resolve_value ?? config.resolve_value_label),
    resolve_value_label: config.resolve_value_label ?? null,
    progress_mode: normalizeProgressMode(config.progress_mode),
    home_team_id: config.home_team_id ?? null,
    home_team_name: config.home_team_name ?? null,
    home_team_abbrev: config.home_team_abbrev ?? null,
    away_team_id: config.away_team_id ?? null,
    away_team_name: config.away_team_name ?? null,
    away_team_abbrev: config.away_team_abbrev ?? null,
  } as Record<string, unknown>;
}

function normalizeResolveValue(value: unknown): number | null {
  if (value == null) return NBA_KOTH_DEFAULT_RESOLVE_VALUE;
  const clamped = clampResolveValue(value);
  return Number.isFinite(clamped) ? clamped : NBA_KOTH_DEFAULT_RESOLVE_VALUE;
}

function normalizeProgressMode(value: unknown): 'starting_now' | 'cumulative' {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'cumulative') return 'cumulative';
  return 'starting_now';
}

async function enrichWithTeamContext(
  cfg: {
    home_team_id?: string | null;
    home_team_name?: string | null;
    home_team_abbrev?: string | null;
    away_team_id?: string | null;
    away_team_name?: string | null;
    away_team_abbrev?: string | null;
  },
  league: League,
  gameId: string,
) {
  if (!gameId) return;
  const [homeTeam, awayTeam] = await Promise.all([getHomeTeam(league, gameId), getAwayTeam(league, gameId)]);
  if (!cfg.home_team_id) cfg.home_team_id = homeTeam?.teamId ?? null;
  if (!cfg.home_team_name) cfg.home_team_name = homeTeam?.displayName ?? null;
  if (!cfg.home_team_abbrev) cfg.home_team_abbrev = homeTeam?.abbreviation ?? null;
  if (!cfg.away_team_id) cfg.away_team_id = awayTeam?.teamId ?? null;
  if (!cfg.away_team_name) cfg.away_team_name = awayTeam?.displayName ?? null;
  if (!cfg.away_team_abbrev) cfg.away_team_abbrev = awayTeam?.abbreviation ?? null;
}

export function buildKingOfTheHillMetadata() {
  return {
    statKeyToCategory: NBA_KOTH_STAT_KEY_TO_CATEGORY,
    statKeyLabels: NBA_KOTH_STAT_KEY_LABELS,
  } as Record<string, unknown>;
}
