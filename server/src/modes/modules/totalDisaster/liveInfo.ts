import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { formatMatchup } from '../../shared/teamUtils';
import { normalizeLine, describeLine, type TotalDisasterConfig } from './evaluator';
import { normalizeNumber, formatNumber } from '../../../utils/number';
import { getScores, getHomeTeam, getAwayTeam, extractTeamAbbreviation, extractTeamName } from '../../../services/nflData/nflRefinedDataAccessors';

export async function getTotalDisasterLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { config, nflGameId } = input;
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
  const gameId = nflGameId ?? typedConfig.nfl_game_id ?? null;
  if (!gameId) {
    return {
      ...baseResult,
      fields: [{ label: 'Target Line', value: formatNumber(line) }],
      unavailableReason: 'No game associated with this bet',
    };
  }

  const [homeTeam, awayTeam, scoreBundle] = await Promise.all([
    getHomeTeam(gameId),
    getAwayTeam(gameId),
    getScores(gameId),
  ]);

  const homeScore = normalizeNumber(scoreBundle.home);
  const awayScore = normalizeNumber(scoreBundle.away);
  const totalPoints = homeScore + awayScore;

  const homeName = typedConfig.home_team_name ?? resolveTeamLabel(homeTeam) ?? 'Home';
  const awayName = typedConfig.away_team_name ?? resolveTeamLabel(awayTeam) ?? 'Away';

  const matchup = formatMatchup({ homeName, awayName });

  const fields = [
    ...(matchup ? [{ label: 'Matchup', value: matchup }] : []),
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

function resolveTeamLabel(team: unknown): string | null {
  return extractTeamAbbreviation(team as any) ?? extractTeamName(team as any) ?? null;
}
