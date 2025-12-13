import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { ensureRefinedGameDoc } from '../../shared/gameDocProvider';
import { formatNumber, normalizeNumber } from '../../../utils/number';
import {
  type GiveAndTakeConfig,
  normalizeSpread,
  describeSpread,
  resolveTeams,
} from './evaluator';

export async function getGiveAndTakeLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { config, nflGameId } = input;
  const typedConfig = config as GiveAndTakeConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: 'give_and_take',
    modeLabel: 'Give And Take',
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

  const doc = await ensureRefinedGameDoc(gameId);
  if (!doc) {
    return {
      ...baseResult,
      fields: [
        { label: `${homeName} Spread`, value: formatNumber(spread) },
      ],
      unavailableReason: 'Game data unavailable',
    };
  }

  // Extract team scores
  const { homeTeam, awayTeam } = resolveTeams(doc, typedConfig);
  const homeScore = normalizeNumber((homeTeam as any)?.score);
  const awayScore = normalizeNumber((awayTeam as any)?.score);
  const adjustedHomeScore = homeScore + spread;

  return {
    ...baseResult,
    fields: [
      { label: `${homeName} (Adjusted)`, value: formatNumber(adjustedHomeScore) },
      { label: awayName, value: awayScore },
    ],
  };
}
