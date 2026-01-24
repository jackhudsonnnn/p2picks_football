import type { BetProposal } from '../../../../supabaseClient';
import { getAwayTeam, getHomeTeam } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { normalizeResolveAt } from '../../utils/resolveUtils';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { SPREAD_MAX, SPREAD_MIN } from './constants';

interface SpreadTheWealthConfig {
  league_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  home_team_abbrev?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  away_team_abbrev?: string | null;
  spread?: string | null;
  spread_value?: number | null;
  spread_label?: string | null;
  resolve_at?: string | null;
}

export async function prepareSpreadTheWealthConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as SpreadTheWealthConfig;

  if (!nextConfig.league_game_id) {
		nextConfig.league_game_id = bet.league_game_id ?? null;
  }

  nextConfig.resolve_at = normalizeResolveAt(
    nextConfig.resolve_at,
    ALLOWED_RESOLVE_AT,
    DEFAULT_RESOLVE_AT,
  );

  const normalizedSpread = normalizeSpread(nextConfig.spread_value ?? nextConfig.spread);
  if (normalizedSpread == null) {
    nextConfig.spread_value = null;
    nextConfig.spread_label = null;
    nextConfig.spread = null;
  } else {
    const spreadStr = formatSpread(normalizedSpread);
    nextConfig.spread_value = normalizedSpread;
    nextConfig.spread_label = spreadStr;
    nextConfig.spread = spreadStr;
  }

  const gameId = nextConfig.league_game_id ? String(nextConfig.league_game_id) : '';
  if (!gameId) {
    return nextConfig as Record<string, unknown>;
  }

  const league: League = bet.league ?? 'NFL';

  try {
    const [homeTeam, awayTeam] = await Promise.all([getHomeTeam(league, gameId), getAwayTeam(league, gameId)]);

    if (!nextConfig.home_team_id) {
      nextConfig.home_team_id = homeTeam?.teamId ?? null;
    }
    if (!nextConfig.home_team_abbrev) {
      nextConfig.home_team_abbrev = homeTeam?.abbreviation ?? null;
    }
    if (!nextConfig.home_team_name) {
      nextConfig.home_team_name = homeTeam?.displayName ?? null;
    }
    if (!nextConfig.away_team_id) {
      nextConfig.away_team_id = awayTeam?.teamId ?? null;
    }
    if (!nextConfig.away_team_abbrev) {
      nextConfig.away_team_abbrev = awayTeam?.abbreviation ?? null;
    }
    if (!nextConfig.away_team_name) {
      nextConfig.away_team_name = awayTeam?.displayName ?? null;
    }
  } catch (err) {
    // ignore errors to keep config preparation resilient
  }

  return nextConfig as Record<string, unknown>;
}

function normalizeSpread(raw: unknown): number | null {
  const numeric = toNumber(raw);
  if (numeric == null) return null;
  if (numeric < SPREAD_MIN || numeric > SPREAD_MAX) return null;

  // Accept whole numbers and .5 increments
  const scaled = Math.round(numeric * 2);
  if (Math.abs(numeric * 2 - scaled) > 1e-9) return null;
  if (!Number.isInteger(scaled)) return null;
  const normalized = scaled / 2;
  if (!Number.isFinite(normalized)) return null;
  return normalized;
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
    if (!Number.isFinite(num)) return null;
    return num;
  }
  return null;
}

function formatSpread(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `-${fixed}`;
}

