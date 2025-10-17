import type { BetProposal } from '../../../supabaseClient';
import { loadRefinedGame, type RefinedGameDoc, type Team } from '../../../helpers';

const LINE_MIN = 0.5;
const LINE_MAX = 199.5;

interface SpreadTheWealthConfig {
  nfl_game_id?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
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

function pickHomeTeam(doc: RefinedGameDoc): Team | null {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  return (
    teams.find((team) => String((team as any)?.homeAway || '').toLowerCase() === 'home') ||
    teams[0] ||
    null
  );
}

function pickAwayTeam(doc: RefinedGameDoc, home: Team | null): Team | null {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  const byFlag = teams.find((team) => String((team as any)?.homeAway || '').toLowerCase() === 'away');
  if (byFlag) return byFlag;
  return teams.find((team) => team !== home) || null;
}

function extractTeamId(team: Team | null): string | null {
  if (!team) return null;
  const rawId = (team as any)?.teamId || (team as any)?.abbreviation;
  return rawId ? String(rawId) : null;
}

function extractTeamName(team: Team | null): string | null {
  if (!team) return null;
  const name = (team as any)?.name || (team as any)?.abbreviation || (team as any)?.teamId;
  return name ? String(name) : null;
}
