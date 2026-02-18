/**
 * Shared Spread Evaluator
 *
 * Generic spread betting evaluation logic used by both NFL and NBA
 * spreadTheWealth modes. This consolidates the duplicate code into
 * a single source of truth.
 */

import { listTeams, type LeagueTeam } from '../../services/leagueData';
import type { League } from '../../types/league';
import { formatNumber, isApproximatelyEqual, normalizeNumber } from '../../utils/number';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for spread-based betting modes.
 * This interface is league-agnostic.
 */
export interface SpreadConfig {
  spread?: string | null;
  spread_value?: number | null;
  spread_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  league_game_id?: string | null;
  resolve_at?: string | null;
}

/**
 * Result of evaluating a spread bet.
 */
export interface SpreadEvaluationResult {
  homeScore: number;
  awayScore: number;
  adjustedHomeScore: number;
  spread: number;
  decision: 'home' | 'away' | 'tie';
}

/**
 * Team lookup result with score information.
 */
export interface TeamWithScore {
  teamId?: string;
  name?: string;
  displayName?: string;
  abbreviation?: string;
  homeAway?: string;
  score?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spread Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a numeric spread value from config.
 * Handles both numeric and string spread values.
 */
export function normalizeSpread<T extends SpreadConfig>(config: T): number | null {
  if (typeof config.spread_value === 'number' && Number.isFinite(config.spread_value)) {
    return config.spread_value;
  }
  if (typeof config.spread === 'string') {
    const parsed = Number.parseFloat(config.spread);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Gets a human-readable description of the spread.
 * Returns the label, string value, or formatted number.
 */
export function describeSpread<T extends SpreadConfig>(config: T): string | null {
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

// ─────────────────────────────────────────────────────────────────────────────
// Team Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Looks up a team from a list by ID, name, or homeAway designation.
 * Handles different team object structures across leagues.
 */
function lookupTeam(
  teams: TeamWithScore[],
  id?: string | null,
  name?: string | null,
  homeAway?: 'home' | 'away',
): TeamWithScore | null {
  const normalizedId = id ?? null;
  if (normalizedId) {
    const byId = teams.find(
      (team) => team?.teamId === normalizedId || team?.abbreviation === normalizedId,
    );
    if (byId) return byId;
  }

  const normalizedName = name ? name.trim().toLowerCase() : '';
  if (normalizedName) {
    const byName = teams.find((team) => {
      // Check both 'name' and 'displayName' for cross-league compatibility
      const teamName = String(team?.name ?? team?.displayName ?? '').trim().toLowerCase();
      const teamAbbrev = String(team?.abbreviation ?? '').trim().toLowerCase();
      return teamName === normalizedName || teamAbbrev === normalizedName;
    });
    if (byName) return byName;
  }

  if (homeAway) {
    const bySide = teams.find(
      (team) => String(team?.homeAway || '').trim().toLowerCase() === homeAway,
    );
    if (bySide) return bySide;
  }

  return null;
}

/**
 * Resolves home and away teams from config and live game data.
 */
export async function resolveTeams<T extends SpreadConfig>(
  config: T,
  league: League,
): Promise<{ homeTeam: TeamWithScore | null; awayTeam: TeamWithScore | null }> {
  const teams: TeamWithScore[] = config?.league_game_id
    ? ((await listTeams(league, config.league_game_id)) as TeamWithScore[])
    : [];

  let home = lookupTeam(teams, config.home_team_id, config.home_team_name, 'home');
  let away = lookupTeam(teams, config.away_team_id, config.away_team_name, 'away');

  // Fallback to first/second team if lookup fails
  if (!home && teams.length > 0) {
    home = teams[0];
  }
  if (!away && teams.length > 1) {
    away = teams.find((team) => team !== home) ?? teams[teams.length - 1];
  }

  return { homeTeam: home, awayTeam: away };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spread Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates a spread bet and determines the winner.
 *
 * @param config - The spread configuration with team info
 * @param spread - The point spread value (positive = home team disadvantage)
 * @param league - The league identifier for data lookup
 * @returns Evaluation result with scores and decision
 */
export async function evaluateSpread<T extends SpreadConfig>(
  config: T,
  spread: number,
  league: League,
): Promise<SpreadEvaluationResult> {
  const { homeTeam, awayTeam } = await resolveTeams(config, league);

  const homeScore = normalizeNumber(homeTeam?.score);
  const awayScore = normalizeNumber(awayTeam?.score);
  const adjustedHomeScore = homeScore + spread;

  // Check for tie using approximate equality (handles floating point)
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

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Exports (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

// Re-export with legacy names for modules that haven't been updated
export type SpreadTheWealthConfig = SpreadConfig;
export type NbaSpreadTheWealthConfig = SpreadConfig;
export type SpreadTheWealthEvaluationResult = SpreadEvaluationResult;
export type NbaSpreadTheWealthEvaluationResult = SpreadEvaluationResult;

/**
 * @deprecated Use evaluateSpread with explicit league parameter
 */
export async function evaluateSpreadTheWealth(
  config: SpreadConfig,
  spread: number,
  league: League = 'NFL',
): Promise<SpreadEvaluationResult> {
  return evaluateSpread(config, spread, league);
}
