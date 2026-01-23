import type { BetProposal } from '../../../../supabaseClient';
import {
  getAwayTeam,
  getHomeTeam,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import type { NbaScoreSorcererConfig } from './evaluator';

const league: League = 'NBA';

export async function prepareNbaScoreSorcererConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as NbaScoreSorcererConfig;

  if (!nextConfig.league_game_id) {
    nextConfig.league_game_id = bet.league_game_id ?? null;
  }

  const gameId = nextConfig.league_game_id ? String(nextConfig.league_game_id) : '';
  if (!gameId) return nextConfig as Record<string, unknown>;

  try {
    const [homeTeam, awayTeam] = await Promise.all([
      getHomeTeam(league, gameId),
      getAwayTeam(league, gameId),
    ]);

    if (!nextConfig.home_team_id) nextConfig.home_team_id = extractTeamId(homeTeam);
    if (!nextConfig.home_team_abbrev) nextConfig.home_team_abbrev = extractTeamAbbreviation(homeTeam);
    if (!nextConfig.home_team_name) nextConfig.home_team_name = extractTeamName(homeTeam);
    if (!nextConfig.away_team_id) nextConfig.away_team_id = extractTeamId(awayTeam);
    if (!nextConfig.away_team_abbrev) nextConfig.away_team_abbrev = extractTeamAbbreviation(awayTeam);
    if (!nextConfig.away_team_name) nextConfig.away_team_name = extractTeamName(awayTeam);
  } catch (err) {
    // swallow errors to keep config preparation resilient
  }

  return nextConfig as Record<string, unknown>;
}
