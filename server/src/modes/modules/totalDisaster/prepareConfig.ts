import type { BetProposal } from '../../../supabaseClient';
import { getAwayTeam, getHomeTeam, extractTeamId, extractTeamName, extractTeamAbbreviation } from '../../../services/nflData/nflRefinedDataAccessors';
import { normalizeResolveAt } from '../../shared/resolveUtils';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../shared/statConstants';
import { LINE_MAX, LINE_MIN } from './constants';

interface TotalDisasterConfig {
  nfl_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  home_team_abbrev?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  away_team_abbrev?: string | null;
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  resolve_at?: string | null;
}

export async function prepareTotalDisasterConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as TotalDisasterConfig;

  if (!nextConfig.nfl_game_id) {
    nextConfig.nfl_game_id = bet.nfl_game_id ?? null;
  }

  nextConfig.resolve_at = normalizeResolveAt(
    nextConfig.resolve_at,
    ALLOWED_RESOLVE_AT,
    DEFAULT_RESOLVE_AT,
  );

  const normalizedLine = normalizeLine(nextConfig.line_value ?? nextConfig.line);
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

  const gameId = nextConfig.nfl_game_id ? String(nextConfig.nfl_game_id) : '';
  if (!gameId) {
    return nextConfig as Record<string, unknown>;
  }

  try {
    const [homeTeam, awayTeam] = await Promise.all([getHomeTeam(gameId), getAwayTeam(gameId)]);

    if (!nextConfig.home_team_id) {
      nextConfig.home_team_id = extractTeamId(homeTeam);
    }
    if (!nextConfig.home_team_abbrev) {
      nextConfig.home_team_abbrev = extractTeamAbbreviation(homeTeam);
    }
    if (!nextConfig.home_team_name) {
      nextConfig.home_team_name = extractTeamName(homeTeam);
    }
    if (!nextConfig.away_team_id) {
      nextConfig.away_team_id = extractTeamId(awayTeam);
    }
    if (!nextConfig.away_team_abbrev) {
      nextConfig.away_team_abbrev = extractTeamAbbreviation(awayTeam);
    }
    if (!nextConfig.away_team_name) {
      nextConfig.away_team_name = extractTeamName(awayTeam);
    }
  } catch (err) {
    // swallow errors so configuration preparation never throws for missing game context
  }

  return nextConfig as Record<string, unknown>;
}

function normalizeLine(raw: unknown): number | null {
  const numeric = toNumber(raw);
  if (numeric == null) return null;
  if (numeric < LINE_MIN || numeric > LINE_MAX) return null;
  const rounded = Math.round(numeric * 10) / 10;
  const scaled = Math.round(rounded * 2);
  if (!Number.isFinite(rounded) || !Number.isInteger(scaled)) return null;
  if (Math.abs(scaled) % 2 !== 1) return null; // ensures .5 increments
  return scaled / 2;
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

