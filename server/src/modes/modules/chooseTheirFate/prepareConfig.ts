import type { BetProposal } from '../../../supabaseClient';
import {
  getTeam,
  getHomeTeam,
  getAwayTeam,
  getPossessionTeamId,
  getPossessionTeamName,
  extractTeamId,
  extractTeamAbbreviation,
  extractTeamName,
} from '../../../services/nflData/nflRefinedDataAccessors';

async function resolvePossessionTeam(gameId: string, teamId?: string | null): Promise<{ id: string | null; name: string | null }> {
  if (teamId) {
    const team = await getTeam(gameId, String(teamId));
    if (team) {
      return {
        id: extractTeamId(team),
        name: extractTeamName(team),
      };
    }
  }

  // Fallback to live possession info
  const [id, name] = await Promise.all([
    getPossessionTeamId(gameId),
    getPossessionTeamName(gameId),
  ]);

  return { id: id ?? null, name: name ?? null };
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
	home_team_abbrev?: string | null;
    away_team_id?: string | null;
    away_team_name?: string | null;
	away_team_abbrev?: string | null;
    possession_team_id?: string | null;
    possession_team_name?: string | null;
  };

  if (!nextConfig.nfl_game_id) {
    nextConfig.nfl_game_id = bet.league_game_id ?? null;
  }

  const gameId = nextConfig.nfl_game_id ? String(nextConfig.nfl_game_id) : '';
  if (!gameId) {
    return nextConfig;
  }

  try {
    const homeTeam = await getHomeTeam(gameId);
    const awayTeam = await getAwayTeam(gameId);

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

    const possessionTeam = await resolvePossessionTeam(gameId, nextConfig.possession_team_id ?? null);
    if (possessionTeam) {
      if (!nextConfig.possession_team_id) {
        nextConfig.possession_team_id = possessionTeam.id;
      }
      if (!nextConfig.possession_team_name) {
        nextConfig.possession_team_name = possessionTeam.name ?? possessionTeam.id ?? null;
      }
    }
  } catch (err) {
    // swallow errors to avoid breaking config preparation if game data is unavailable
  }

  return nextConfig;
}
