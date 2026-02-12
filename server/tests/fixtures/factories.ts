/**
 * Test Fixtures - Factory Functions
 *
 * Provides factory functions for creating test data objects.
 * All factories return objects with sensible defaults that can be overridden.
 */

import type { BetProposal } from '../../src/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Bet Proposal Factory
// ─────────────────────────────────────────────────────────────────────────────

export interface BetProposalOverrides {
  bet_id?: string;
  table_id?: string;
  league_game_id?: string;
  league?: 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'U2Pick';
  mode_key?: string;
  bet_status?: 'active' | 'pending' | 'resolved' | 'washed';
  description?: string;
  wager_amount?: number;
  time_limit_seconds?: number;
  close_time?: string | null;
  proposal_time?: string;
  winning_choice?: string | null;
}

/**
 * Create a mock BetProposal for testing
 */
export function createBetProposal(overrides: BetProposalOverrides = {}): BetProposal {
  const now = new Date();
  const closeTime = new Date(now.getTime() + 60000); // 1 minute from now

  return {
    bet_id: overrides.bet_id ?? `test-bet-${Date.now()}`,
    table_id: overrides.table_id ?? 'test-table-123',
    league_game_id: overrides.league_game_id ?? '401234567',
    league: overrides.league ?? 'NFL',
    mode_key: overrides.mode_key ?? 'spread_the_wealth',
    bet_status: overrides.bet_status ?? 'active',
    description: overrides.description ?? 'Test bet description',
    wager_amount: overrides.wager_amount ?? 1.0,
    time_limit_seconds: overrides.time_limit_seconds ?? 60,
    close_time: overrides.close_time ?? closeTime.toISOString(),
    proposal_time: overrides.proposal_time ?? now.toISOString(),
    winning_choice: overrides.winning_choice ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// User Factory
// ─────────────────────────────────────────────────────────────────────────────

export interface UserOverrides {
  user_id?: string;
  username?: string;
  email?: string;
  created_at?: string;
}

export interface MockUser {
  user_id: string;
  username: string;
  email: string;
  created_at: string;
}

/**
 * Create a mock user for testing
 */
export function createUser(overrides: UserOverrides = {}): MockUser {
  const id = overrides.user_id ?? `user-${Date.now()}`;
  return {
    user_id: id,
    username: overrides.username ?? `testuser_${id.slice(-6)}`,
    email: overrides.email ?? `test-${id.slice(-6)}@example.com`,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Factory
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamOverrides {
  teamId?: string;
  name?: string;
  displayName?: string;
  abbreviation?: string;
  homeAway?: 'home' | 'away';
  score?: number;
}

export interface MockTeam {
  teamId: string;
  name: string;
  displayName: string;
  abbreviation: string;
  homeAway: 'home' | 'away';
  score: number;
}

/**
 * Create a mock team for testing
 */
export function createTeam(overrides: TeamOverrides = {}): MockTeam {
  return {
    teamId: overrides.teamId ?? '1',
    name: overrides.name ?? 'Test Team',
    displayName: overrides.displayName ?? overrides.name ?? 'Test Team',
    abbreviation: overrides.abbreviation ?? 'TST',
    homeAway: overrides.homeAway ?? 'home',
    score: overrides.score ?? 0,
  };
}

/**
 * Create a pair of home/away teams
 */
export function createTeamPair(
  homeOverrides: TeamOverrides = {},
  awayOverrides: TeamOverrides = {},
): { home: MockTeam; away: MockTeam } {
  return {
    home: createTeam({
      teamId: '1',
      name: 'Home Team',
      abbreviation: 'HOM',
      homeAway: 'home',
      ...homeOverrides,
    }),
    away: createTeam({
      teamId: '2',
      name: 'Away Team',
      abbreviation: 'AWY',
      homeAway: 'away',
      ...awayOverrides,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spread Config Factory
// ─────────────────────────────────────────────────────────────────────────────

export interface SpreadConfigOverrides {
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
 * Create a spread mode config for testing
 */
export function createSpreadConfig(overrides: SpreadConfigOverrides = {}): SpreadConfigOverrides {
  return {
    spread: overrides.spread ?? null,
    spread_value: overrides.spread_value ?? -3.5,
    spread_label: overrides.spread_label ?? '-3.5',
    home_team_id: overrides.home_team_id ?? '1',
    home_team_name: overrides.home_team_name ?? 'Home Team',
    away_team_id: overrides.away_team_id ?? '2',
    away_team_name: overrides.away_team_name ?? 'Away Team',
    league_game_id: overrides.league_game_id ?? '401234567',
    resolve_at: overrides.resolve_at ?? 'End of Game',
  };
}
