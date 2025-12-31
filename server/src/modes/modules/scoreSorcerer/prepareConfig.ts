import type { BetProposal } from '../../../supabaseClient';
import { getGameDoc } from '../../../services/nflRefinedDataService';
import { extractTeamAbbreviation, extractTeamId, extractTeamName, pickAwayTeam, pickHomeTeam } from '../../shared/utils';
import type { ScoreSorcererConfig } from './evaluator';

export async function prepareScoreSorcererConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const nextConfig = { ...config } as ScoreSorcererConfig;

  if (!nextConfig.nfl_game_id) {
    nextConfig.nfl_game_id = bet.nfl_game_id ?? null;
  }

  const gameId = nextConfig.nfl_game_id ? String(nextConfig.nfl_game_id) : '';
  if (!gameId) return nextConfig as Record<string, unknown>;

  try {
    const doc = await getGameDoc(gameId);
    if (!doc) return nextConfig as Record<string, unknown>;

    const homeTeam = pickHomeTeam(doc);
    const awayTeam = pickAwayTeam(doc, homeTeam);

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
