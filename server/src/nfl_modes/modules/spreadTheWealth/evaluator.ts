import { listTeams } from '../../../services/nflData/nflRefinedDataAccessors';
import { formatNumber, isApproximatelyEqual, normalizeNumber } from '../../../utils/number';
import { normalizeTeamId } from '../../shared/teamUtils';

export interface SpreadTheWealthConfig {
  spread?: string | null;
  spread_value?: number | null;
  spread_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  league_game_id?: string | null;
}

export interface SpreadTheWealthEvaluationResult {
  homeScore: number;
  awayScore: number;
  adjustedHomeScore: number;
  spread: number;
  decision: 'home' | 'away' | 'tie';
}

export function normalizeSpread(config: SpreadTheWealthConfig): number | null {
  if (typeof config.spread_value === 'number' && Number.isFinite(config.spread_value)) {
    return config.spread_value;
  }
  if (typeof config.spread === 'string') {
    const parsed = Number.parseFloat(config.spread);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function describeSpread(config: SpreadTheWealthConfig): string | null {
  const label = typeof config.spread_label === 'string' ? config.spread_label.trim() : '';
  if (label.length) return label;
  if (typeof config.spread === 'string' && config.spread.trim().length) {
    return config.spread.trim();
  }
  if (typeof config.spread_value === 'number' && Number.isFinite(config.spread_value)) {
    return formatNumber(config.spread_value);
  }
  return null;
}

export async function resolveTeams(
  config: SpreadTheWealthConfig,
): Promise<{ homeTeam: any; awayTeam: any }> {
  const teams = config?.league_game_id ? await listTeams(config.league_game_id) : [];
  let home = lookupTeam(teams, config.home_team_id, config.home_team_name, 'home');
  let away = lookupTeam(teams, config.away_team_id, config.away_team_name, 'away');
  if (!home && teams.length > 0) home = teams[0];
  if (!away && teams.length > 1) {
    away = teams.find((team) => team !== home) ?? teams[teams.length - 1];
  }
  return { homeTeam: home, awayTeam: away };
}

export async function evaluateSpreadTheWealth(
  config: SpreadTheWealthConfig,
  spread: number,
): Promise<SpreadTheWealthEvaluationResult> {
  const { homeTeam, awayTeam } = await resolveTeams(config);
  const homeScore = normalizeNumber((homeTeam as any)?.score);
  const awayScore = normalizeNumber((awayTeam as any)?.score);
  const adjustedHomeScore = homeScore + spread;
  if (isApproximatelyEqual(adjustedHomeScore, awayScore)) {
    return {
      homeScore,
      awayScore,
      adjustedHomeScore,
      spread,
      decision: 'tie',
    };
  }
  return {
    homeScore,
    awayScore,
    adjustedHomeScore,
    spread,
    decision: adjustedHomeScore > awayScore ? 'home' : 'away',
  };
}

function lookupTeam(teams: any[], id?: string | null, name?: string | null, homeAway?: 'home' | 'away'): any | null {
  const normalizedId = normalizeTeamId(id);
  if (normalizedId) {
    const byId = teams.find(
      (team) => normalizeTeamId(team?.teamId) === normalizedId || normalizeTeamId(team?.abbreviation) === normalizedId,
    );
    if (byId) return byId;
  }
  const normalizedName = name ? name.trim().toLowerCase() : '';
  if (normalizedName) {
    const byName = teams.find(
      (team) =>
        String(team?.name ?? '').trim().toLowerCase() === normalizedName ||
        String(team?.abbreviation ?? '').trim().toLowerCase() === normalizedName,
    );
    if (byName) return byName;
  }
  if (homeAway) {
    const bySide = teams.find((team) => String(team?.homeAway || '').trim().toLowerCase() === homeAway);
    if (bySide) return bySide;
  }
  return null;
}
