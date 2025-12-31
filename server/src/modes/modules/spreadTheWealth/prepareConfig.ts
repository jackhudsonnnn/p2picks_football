import type { BetProposal } from '../../../supabaseClient';
import { getGameDoc, type RefinedGameDoc } from '../../../services/nflData/nflRefinedDataService';
import { normalizeResolveAt } from '../../shared/resolveUtils';
import { extractTeamAbbreviation, extractTeamId, extractTeamName, pickAwayTeam, pickHomeTeam } from '../../shared/utils';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from '../eitherOr/constants';

const SPREAD_MIN = -99.5;
const SPREAD_MAX = 99.5;

interface SpreadTheWealthConfig {
  nfl_game_id?: string | null;
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

  if (!nextConfig.nfl_game_id) {
    nextConfig.nfl_game_id = bet.nfl_game_id ?? null;
  }

  nextConfig.resolve_at = normalizeResolveAt(
    nextConfig.resolve_at,
    EITHER_OR_ALLOWED_RESOLVE_AT,
    EITHER_OR_DEFAULT_RESOLVE_AT,
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

  const gameId = nextConfig.nfl_game_id ? String(nextConfig.nfl_game_id) : '';
  if (!gameId) {
    return nextConfig as Record<string, unknown>;
  }

  try {
    const doc = await getGameDoc(gameId);
    if (!doc) return nextConfig as Record<string, unknown>;

    const homeTeam = pickHomeTeam(doc);
    const awayTeam = pickAwayTeam(doc, homeTeam);

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

