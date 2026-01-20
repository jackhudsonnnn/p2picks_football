import type { BetProposal } from '../../../supabaseClient';
import {
  getHomeTeam,
  getAwayTeam,
  getPlayerStat,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../services/nflData/nflRefinedDataAccessors';
import {
  KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
  KING_OF_THE_HILL_MAX_RESOLVE_VALUE,
  KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
  KING_OF_THE_HILL_STAT_KEY_LABELS,
  KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
  clampResolveValue,
  isValidResolveValue,
} from './constants';
import { type PlayerRef } from '../../shared/playerUtils';

type KingOfTheHillConfig = Record<string, unknown> & {
  nfl_game_id?: string | null;
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
  resolve_value?: number | null;
  resolve_value_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  home_team_abbrev?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  away_team_abbrev?: string | null;
  progress_mode?: string | null;
};

export async function prepareKingOfTheHillConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const cfg = { ...config } as KingOfTheHillConfig;

  if (!cfg.nfl_game_id) {
    cfg.nfl_game_id = bet.nfl_game_id ?? null;
  }

  const resolveValue = clampResolveValue(cfg.resolve_value ?? cfg.resolve_value_label ?? KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE);
  cfg.resolve_value = resolveValue;
  cfg.resolve_value_label = cfg.resolve_value_label ?? String(resolveValue);

  if (!cfg.stat_label && cfg.stat) {
    const label = KING_OF_THE_HILL_STAT_KEY_LABELS[cfg.stat];
    if (label) cfg.stat_label = label;
  }

  cfg.progress_mode = normalizeProgressMode(cfg.progress_mode);

  const statKey = cfg.stat ? String(cfg.stat) : '';
  const category = KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY[statKey];
  const gameId = cfg.nfl_game_id ? String(cfg.nfl_game_id) : '';

  if (!statKey || !category || !gameId) {
    return normalizeConfigPayload(cfg);
  }

  try {
    await enrichWithTeamContext(cfg, gameId);

    const [player1Value, player2Value] = await Promise.all([
      fetchPlayerStat(gameId, statKey, { id: cfg.player1_id, name: cfg.player1_name }),
      fetchPlayerStat(gameId, statKey, { id: cfg.player2_id, name: cfg.player2_name }),
    ]);

    return {
      ...normalizeConfigPayload(cfg),
      initial_player1_value: player1Value,
      initial_player2_value: player2Value,
      initial_captured_at: new Date().toISOString(),
    } as Record<string, unknown>;
  } catch (err) {
    console.warn('[kingOfTheHill] failed to prepare config', {
      bet_id: bet.bet_id,
      error: (err as Error).message,
    });
    return normalizeConfigPayload(cfg);
  }
}

function normalizeConfigPayload(config: KingOfTheHillConfig) {
  return {
    nfl_game_id: config.nfl_game_id ?? null,
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
    resolve_value: isValidResolveValue(config.resolve_value) ? config.resolve_value : KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
    resolve_value_label: config.resolve_value_label ?? String(config.resolve_value ?? KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE),
    home_team_id: config.home_team_id ?? null,
    home_team_name: config.home_team_name ?? null,
    home_team_abbrev: config.home_team_abbrev ?? null,
    away_team_id: config.away_team_id ?? null,
    away_team_name: config.away_team_name ?? null,
    away_team_abbrev: config.away_team_abbrev ?? null,
    progress_mode: normalizeProgressMode(config.progress_mode),
  } as Record<string, unknown>;
}

async function fetchPlayerStat(gameId: string, statKey: string, ref: PlayerRef): Promise<number | null> {
  const category = KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY[statKey];
  if (!category) return null;
  const playerKey = resolvePlayerKey(ref.id, ref.name);
  if (!playerKey) return null;
  const value = await getPlayerStat(gameId, playerKey, category, statKey);
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
  gameId: string,
) {
  const homeTeam = await getHomeTeam(gameId);
  const awayTeam = await getAwayTeam(gameId);

  if (!cfg.home_team_id) {
    cfg.home_team_id = extractTeamId(homeTeam);
  }
  if (!cfg.home_team_name) {
    cfg.home_team_name = extractTeamName(homeTeam);
  }
  if (!cfg.home_team_abbrev) {
    cfg.home_team_abbrev = extractTeamAbbreviation(homeTeam);
  }
  if (!cfg.away_team_id) {
    cfg.away_team_id = extractTeamId(awayTeam);
  }
  if (!cfg.away_team_name) {
    cfg.away_team_name = extractTeamName(awayTeam);
  }
  if (!cfg.away_team_abbrev) {
    cfg.away_team_abbrev = extractTeamAbbreviation(awayTeam);
  }
}

function normalizeProgressMode(value: unknown): 'starting_now' | 'cumulative' {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'cumulative') {
    return 'cumulative';
  }
  return 'starting_now';
}

export function buildKingOfTheHillMetadata(): Record<string, unknown> {
  return {
    statKeyToCategory: KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY,
    statKeyLabels: KING_OF_THE_HILL_STAT_KEY_LABELS,
    resolveValue: {
      min: KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
      max: KING_OF_THE_HILL_MAX_RESOLVE_VALUE,
      default: KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE,
    },
  } as Record<string, unknown>;
}
