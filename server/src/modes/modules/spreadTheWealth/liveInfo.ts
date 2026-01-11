import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { formatNumber, normalizeNumber } from '../../../utils/number';
import { type SpreadTheWealthConfig, normalizeSpread, describeSpread } from './evaluator';
import {
  getAwayTeam,
  getHomeScore,
  getAwayScore,
  getHomeTeam,
  getMatchup,
} from '../../../services/nflData/nflRefinedDataAccessors';

export async function getSpreadTheWealthLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { config, nflGameId } = input;
  const typedConfig = config as SpreadTheWealthConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: 'spread_the_wealth',
    modeLabel: 'Spread The Wealth',
    fields: [],
  };

  // Get team names
  const homeName = typedConfig.home_team_name ?? typedConfig.home_team_id ?? 'Home';
  const awayName = typedConfig.away_team_name ?? typedConfig.away_team_id ?? 'Away';

  // Get spread
  const spread = normalizeSpread(typedConfig);
  const spreadLabel = describeSpread(typedConfig) ?? 'N/A';

  if (spread == null) {
    return {
      ...baseResult,
      fields: [{ label: 'Spread', value: spreadLabel }],
      unavailableReason: 'Invalid spread configuration',
    };
  }

  // Try to get live game data
  const gameId = nflGameId ?? typedConfig.nfl_game_id ?? null;
  if (!gameId) {
    return {
      ...baseResult,
      fields: [
        { label: `${homeName} Spread`, value: formatNumber(spread) },
      ],
      unavailableReason: 'No game associated with this bet',
    };
  }

  const [homeTeam, awayTeam, homeScoreRaw, awayScoreRaw] = await Promise.all([
    getHomeTeam(gameId),
    getAwayTeam(gameId),
    getHomeScore(gameId),
    getAwayScore(gameId),
  ]);

  const homeScore = normalizeNumber(homeScoreRaw);
  const awayScore = normalizeNumber(awayScoreRaw);
  const adjustedHomeScore = homeScore + spread;
  const matchupLabel = await getMatchup(gameId || '');
  const fields = [
    { label: 'Matchup', value: matchupLabel },
    { label: `${homeName} (Adjusted)`, value: formatNumber(adjustedHomeScore) },
    { label: awayName, value: awayScore },
  ];

  return {
    ...baseResult,
    fields,
  };
}
