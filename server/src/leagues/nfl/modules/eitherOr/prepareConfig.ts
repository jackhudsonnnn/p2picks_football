import type { BetProposal } from '../../../../supabaseClient';
import {
  getHomeTeam,
  getAwayTeam,
  getPlayerStat,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT, STAT_KEY_TO_CATEGORY, STAT_KEY_LABELS } from '../../utils/statConstants';
import { type PlayerRef } from '../../utils/playerUtils';
import { createLogger } from '../../../../utils/logger';

const logger = createLogger('eitherOr:prepareConfig');

export async function prepareEitherOrConfig({
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
    player1_team_name?: string | null;
    player1_team?: string | null;
    player2_id?: string | null;
    player2_name?: string | null;
    player2_team_name?: string | null;
    player2_team?: string | null;
    stat?: string | null;
    stat_label?: string | null;
    resolve_at?: string | null;
    bet_id?: string | null;
    home_team_id?: string | null;
    home_team_name?: string | null;
    home_team_abbrev?: string | null;
    away_team_id?: string | null;
    away_team_name?: string | null;
    away_team_abbrev?: string | null;
    progress_mode?: string | null;
  };

  if (!cfg.league_game_id) {
    cfg.league_game_id = bet.league_game_id ?? null;
  }

  const league: League = bet.league ?? 'NFL';

  if (!cfg.resolve_at || !ALLOWED_RESOLVE_AT.includes(String(cfg.resolve_at))) {
    cfg.resolve_at = DEFAULT_RESOLVE_AT;
  }

  cfg.progress_mode = normalizeProgressMode(cfg.progress_mode);

  const statKey = cfg.stat ? String(cfg.stat) : '';
  const category = STAT_KEY_TO_CATEGORY[statKey];
  const gameId = cfg.league_game_id ? String(cfg.league_game_id) : '';

  if (!statKey || !category || !gameId) {
    return normalizeConfigPayload(cfg);
  }

  try {
    await enrichWithTeamContext(cfg, league, gameId);

    const [baselinePlayer1, baselinePlayer2] = await Promise.all([
      fetchPlayerStat(league, gameId, statKey, { id: cfg.player1_id, name: cfg.player1_name }),
      fetchPlayerStat(league, gameId, statKey, { id: cfg.player2_id, name: cfg.player2_name }),
    ]);

    return {
      ...normalizeConfigPayload(cfg),
      bet_id: bet.bet_id,
      baseline_player1: baselinePlayer1,
      baseline_player2: baselinePlayer2,
      baseline_captured_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn({
      bet_id: bet.bet_id,
      gameId,
      statKey,
      error: (err as Error).message,
    }, 'failed to capture baselines for either_or');
    return {
      ...normalizeConfigPayload(cfg),
      bet_id: bet.bet_id,
    };
  }
}

function normalizeConfigPayload(config: Record<string, unknown>) {
  return {
    bet_id: config.bet_id ?? null,
    league_game_id: config.league_game_id ?? null,
    player1_id: config.player1_id ?? null,
    player1_name: config.player1_name ?? null,
    player1_team_name: config.player1_team_name ?? config.player1_team ?? null,
    player1_team: config.player1_team ?? config.player1_team_name ?? null,
    player2_id: config.player2_id ?? null,
    player2_name: config.player2_name ?? null,
    player2_team_name: config.player2_team_name ?? config.player2_team ?? null,
    player2_team: config.player2_team ?? config.player2_team_name ?? null,
    stat: config.stat ?? null,
    stat_label: config.stat_label ?? null,
    resolve_at: config.resolve_at ?? null,
    home_team_id: config.home_team_id ?? null,
    home_team_name: config.home_team_name ?? null,
    home_team_abbrev: config.home_team_abbrev ?? null,
    away_team_id: config.away_team_id ?? null,
    away_team_name: config.away_team_name ?? null,
    away_team_abbrev: config.away_team_abbrev ?? null,
    progress_mode: normalizeProgressMode(config.progress_mode),
  } as Record<string, unknown>;
}

async function fetchPlayerStat(league: League, gameId: string, statKey: string, ref: PlayerRef): Promise<number | null> {
  const category = STAT_KEY_TO_CATEGORY[statKey];
  if (!category) return null;

  const playerKey = resolvePlayerKey(ref.id, ref.name);
  if (!playerKey) return null;

  const value = await getPlayerStat(league, gameId, playerKey, category, statKey);
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
  const homeTeam = await getHomeTeam(league, gameId);
  const awayTeam = await getAwayTeam(league, gameId);

  if (!cfg.home_team_id) {
    cfg.home_team_id = homeTeam?.teamId ?? null;
  }
  if (!cfg.home_team_name) {
    cfg.home_team_name = homeTeam?.displayName ?? null;
  }
  if (!cfg.home_team_abbrev) {
    cfg.home_team_abbrev = homeTeam?.abbreviation ?? null;
  }
  if (!cfg.away_team_id) {
    cfg.away_team_id = awayTeam?.teamId ?? null;
  }
  if (!cfg.away_team_name) {
    cfg.away_team_name = awayTeam?.displayName ?? null;
  }
  if (!cfg.away_team_abbrev) {
    cfg.away_team_abbrev = awayTeam?.abbreviation ?? null;
  }
}

export function buildEitherOrMetadata() {
  return {
    statKeyToCategory: STAT_KEY_TO_CATEGORY,
    allowedResolveAt: ALLOWED_RESOLVE_AT,
    statKeyLabels: STAT_KEY_LABELS,
  } as Record<string, unknown>;
}

function normalizeProgressMode(value: unknown): 'starting_now' | 'cumulative' {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'cumulative') {
    return 'cumulative';
  }
  return 'starting_now';
}
