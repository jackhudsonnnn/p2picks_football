import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { normalizeLine, describeLine, type TotalDisasterConfig } from './evaluator';
import { normalizeNumber, formatNumber } from '../../../../utils/number';
import { getScores, getHomeTeam, getAwayTeam, getMatchup } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import type { LeagueTeam } from '../../../../services/leagueData/types';

export async function getTotalDisasterLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { config, leagueGameId, league } = input;
  const typedConfig = config as TotalDisasterConfig;

  const baseResult: ModeLiveInfo = {
  modeKey: 'total_disaster',
    modeLabel: 'Total Disaster',
    fields: [],
  };

  // Get the line
  const line = normalizeLine(typedConfig);
  const lineLabel = describeLine(typedConfig) ?? 'N/A';

  if (line == null) {
    return {
      ...baseResult,
      fields: [{ label: 'Line', value: lineLabel }],
      unavailableReason: 'Invalid line configuration',
    };
  }

  // Try to get live game data
  const gameId = leagueGameId ?? typedConfig.league_game_id ?? null;
  if (!gameId) {
    return {
      ...baseResult,
      fields: [{ label: 'Target Line', value: formatNumber(line) }],
      unavailableReason: 'No game associated with this bet',
    };
  }

  const [homeTeam, awayTeam, scoreBundle] = await Promise.all([
    getHomeTeam(league, gameId),
    getAwayTeam(league, gameId),
    getScores(league, gameId),
  ]);

  const homeScore = normalizeNumber(scoreBundle.home);
  const awayScore = normalizeNumber(scoreBundle.away);
  const totalPoints = homeScore + awayScore;

  const homeName = typedConfig.home_team_name ?? resolveTeamLabel(homeTeam) ?? 'Home';
  const awayName = typedConfig.away_team_name ?? resolveTeamLabel(awayTeam) ?? 'Away';
  const matchupLabel = await getMatchup(league, gameId || '');

  const fields = [
    { label: 'Matchup', value: matchupLabel },
    { label: homeName, value: homeScore },
    { label: awayName, value: awayScore },
    { label: 'Total Points', value: totalPoints },
    { label: 'Target Line', value: formatNumber(line) },
  ];

  return {
    ...baseResult,
    fields,
  };
}

function resolveTeamLabel(team: LeagueTeam | null): string | null {
  if (!team) return null;
  return team.abbreviation ?? team.displayName ?? null;
}
