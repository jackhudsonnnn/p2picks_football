import type { BetProposal } from '../../../supabaseClient';
import { loadRefinedGame, type RefinedGameDoc } from '../../../helpers';
import { extractTeamId, extractTeamName, pickAwayTeam, pickHomeTeam } from '../../shared/utils';

const SPREAD_MIN = -99.5;
const SPREAD_MAX = 99.5;

interface GiveAndTakeConfig {
  nfl_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  spread?: string | null;
  spread_value?: number | null;
  spread_label?: string | null;
}

export async function prepareGiveAndTakeConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as GiveAndTakeConfig;

  if (!nextConfig.nfl_game_id) {
    nextConfig.nfl_game_id = bet.nfl_game_id ?? null;
  }

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
    const doc = await loadRefinedGame(gameId);
    if (!doc) return nextConfig as Record<string, unknown>;

    const homeTeam = pickHomeTeam(doc);
    const awayTeam = pickAwayTeam(doc, homeTeam);

    if (!nextConfig.home_team_id) {
      nextConfig.home_team_id = extractTeamId(homeTeam);
    }
    if (!nextConfig.home_team_name) {
      nextConfig.home_team_name = extractTeamName(homeTeam);
    }
    if (!nextConfig.away_team_id) {
      nextConfig.away_team_id = extractTeamId(awayTeam);
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
  if (Math.abs(numeric) < 0.5) return null;
  const rounded = Math.round(numeric * 10) / 10;
  const scaled = Math.round(rounded * 2);
  if (!Number.isFinite(rounded) || !Number.isInteger(scaled)) return null;
  if (Math.abs(scaled) % 2 !== 1) return null; // enforce .5 increments
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

function formatSpread(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `-${fixed}`;
}

