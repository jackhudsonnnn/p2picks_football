import type { BetProposal } from '../../../supabaseClient';
import { loadRefinedGame, type RefinedGameDoc, type Team, findTeam } from '../../../helpers';

function toLower(value: unknown): string {
  return String(value || '').toLowerCase();
}

function pickHomeTeam(doc: RefinedGameDoc): Team | null {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  return teams.find((team) => toLower((team as any)?.homeAway) === 'home') || teams[0] || null;
}

function pickAwayTeam(doc: RefinedGameDoc, home: Team | null): Team | null {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  const byFlag = teams.find((team) => toLower((team as any)?.homeAway) === 'away');
  if (byFlag) return byFlag;
  return teams.find((team) => team !== home) || null;
}

function extractTeamId(team: Team | null): string | null {
  if (!team) return null;
  const id = (team as any)?.teamId || (team as any)?.abbreviation;
  return id ? String(id) : null;
}

function extractTeamName(team: Team | null): string | null {
  if (!team) return null;
  const name = (team as any)?.displayName || (team as any)?.abbreviation || (team as any)?.teamId;
  return name ? String(name) : null;
}

function resolvePossessionTeam(doc: RefinedGameDoc, teamId?: string | null): Team | null {
  if (teamId) {
    const team = findTeam(doc, String(teamId));
    if (team) return team;
  }
  const flagged = (doc.teams || []).find((team) => Boolean((team as any)?.possession));
  if (flagged) return flagged;
  return null;
}

export async function prepareChooseTheirFateConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as Record<string, unknown> & {
    nfl_game_id?: string | null;
    home_team_id?: string | null;
    home_team_name?: string | null;
    away_team_id?: string | null;
    away_team_name?: string | null;
    possession_team_id?: string | null;
    possession_team_name?: string | null;
  };

  if (!nextConfig.nfl_game_id) {
    nextConfig.nfl_game_id = bet.nfl_game_id ?? null;
  }

  const gameId = nextConfig.nfl_game_id ? String(nextConfig.nfl_game_id) : '';
  if (!gameId) {
    return nextConfig;
  }

  try {
    const doc = await loadRefinedGame(gameId);
    if (!doc) return nextConfig;

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

    const possessionTeam = resolvePossessionTeam(doc, nextConfig.possession_team_id ?? null);
    if (possessionTeam) {
      if (!nextConfig.possession_team_id) {
        nextConfig.possession_team_id = extractTeamId(possessionTeam);
      }
      if (!nextConfig.possession_team_name) {
        nextConfig.possession_team_name = extractTeamName(possessionTeam);
      }
    }
  } catch (err) {
    // swallow errors to avoid breaking config preparation if game data is unavailable
  }

  return nextConfig;
}
