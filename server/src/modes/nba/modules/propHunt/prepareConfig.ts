import type { BetProposal } from '../../../../supabaseClient';
import { getAwayTeam, getHomeTeam, getPlayer } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT, NBA_STAT_KEY_LABELS, NBA_STAT_KEY_TO_CATEGORY, getNbaStatRange } from '../../utils/statConstants';
import { resolvePlayerKey } from '../../utils/playerUtils';
import { NBA_PROP_HUNT_DEFAULT_RESOLVE_AT } from './constants';

interface NbaPropHuntConfig {
  league_game_id?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  resolve_at?: string | null;
  progress_mode?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
}

export async function prepareNbaPropHuntConfig({
  bet,
  config,
  league,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
  league: League;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as NbaPropHuntConfig;
  if (!nextConfig.league_game_id) {
    nextConfig.league_game_id = bet.league_game_id ?? null;
  }

  if (!nextConfig.resolve_at || !ALLOWED_RESOLVE_AT.includes(String(nextConfig.resolve_at) as any)) {
    nextConfig.resolve_at = DEFAULT_RESOLVE_AT;
  }

  // normalize stat label
  const statKey = typeof nextConfig.stat === 'string' ? nextConfig.stat : null;
  if (statKey && NBA_STAT_KEY_LABELS[statKey]) {
    nextConfig.stat_label = NBA_STAT_KEY_LABELS[statKey];
  }

  // normalize line
  const normalizedLine = normalizeLine(nextConfig.line_value ?? nextConfig.line, statKey);
  if (normalizedLine == null) {
    nextConfig.line_value = null;
    nextConfig.line_label = null;
    nextConfig.line = null;
  } else {
    const lineStr = normalizedLine.toFixed(1);
    nextConfig.line_value = normalizedLine;
    nextConfig.line_label = lineStr;
    nextConfig.line = lineStr;
  }

  // attempt to populate player name
  const gameId = nextConfig.league_game_id ? String(nextConfig.league_game_id) : '';
  if (gameId && (nextConfig.player_id || nextConfig.player_name)) {
    const playerKey = resolvePlayerKey(nextConfig.player_id, nextConfig.player_name);
    if (playerKey) {
      try {
        const player = await getPlayer(league ?? 'NBA', gameId, playerKey);
        if (player) {
          nextConfig.player_id = player.playerId ?? nextConfig.player_id ?? null;
          nextConfig.player_name = player.fullName ?? nextConfig.player_name ?? null;
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // attach home/away names for UI completeness
  if (gameId) {
    try {
      const [home, away] = await Promise.all([getHomeTeam(league, gameId), getAwayTeam(league, gameId)]);
      nextConfig.home_team_id = home?.teamId ?? null;
  nextConfig.home_team_name = home?.displayName ?? null;
      nextConfig.away_team_id = away?.teamId ?? null;
  nextConfig.away_team_name = away?.displayName ?? null;
    } catch (err) {
      // ignore
    }
  }

  if (!nextConfig.progress_mode) {
    nextConfig.progress_mode = 'starting_now';
  }

  return nextConfig as Record<string, unknown>;
}

function normalizeLine(raw: unknown, statKey: string | null): number | null {
  const numeric = toNumber(raw);
  if (numeric == null) return null;
  const range = getNbaStatRange(statKey);
  if (numeric < range.min || numeric > range.max) return null;
  const scaled = Math.round(numeric * 2);
  if (Math.abs(scaled) % 2 !== 1) return null; // .5 increments
  return scaled / 2;
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number.parseFloat(trimmed);
    if (!Number.isFinite(num)) return null;
    return num;
  }
  return null;
}
