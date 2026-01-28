import type { BetProposal } from '../../../../supabaseClient';
import { getAwayTeam, getHomeTeam } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { SPREAD_MAX, SPREAD_MIN } from './constants';

interface NbaSpreadConfig {
  league_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  spread?: string | null;
  spread_value?: number | null;
  spread_label?: string | null;
  resolve_at?: string | null;
}

export async function prepareNbaSpreadTheWealthConfig({
  bet,
  config,
  league,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
  league: League;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as NbaSpreadConfig;

  if (!nextConfig.league_game_id) {
    nextConfig.league_game_id = bet.league_game_id ?? null;
  }

  if (!nextConfig.resolve_at || !ALLOWED_RESOLVE_AT.includes(String(nextConfig.resolve_at) as any)) {
    nextConfig.resolve_at = DEFAULT_RESOLVE_AT;
  }

  const normalizedSpread = normalizeSpread(nextConfig.spread_value ?? nextConfig.spread);
  if (normalizedSpread == null) {
    nextConfig.spread_value = null;
    nextConfig.spread_label = null;
    nextConfig.spread = null;
  } else {
    const spreadStr = normalizedSpread.toFixed(1);
    nextConfig.spread_value = normalizedSpread;
    nextConfig.spread_label = spreadStr;
    nextConfig.spread = spreadStr;
  }

  const gameId = nextConfig.league_game_id ? String(nextConfig.league_game_id) : '';
  if (!gameId) return nextConfig as Record<string, unknown>;

  const leagueToUse: League = league ?? bet.league ?? 'NBA';

  try {
    const [home, away] = await Promise.all([getHomeTeam(leagueToUse, gameId), getAwayTeam(leagueToUse, gameId)]);
    nextConfig.home_team_id = home?.teamId ?? null;
    nextConfig.home_team_name = home?.displayName ?? null;
    nextConfig.away_team_id = away?.teamId ?? null;
    nextConfig.away_team_name = away?.displayName ?? null;
  } catch (err) {
    // ignore
  }

  return nextConfig as Record<string, unknown>;
}

function normalizeSpread(raw: unknown): number | null {
  const numeric = toNumber(raw);
  if (numeric == null) return null;
  if (numeric < SPREAD_MIN || numeric > SPREAD_MAX) return null;
  const scaled = Math.round(numeric * 2);
  // allow whole numbers and .5 increments
  if (Math.abs(numeric * 2 - scaled) > 1e-9) return null;
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
