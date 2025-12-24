import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { ensureRefinedGameDoc } from '../../shared/gameDocProvider';
import { listTeams } from '../../shared/teamUtils';
import { normalizeLine, describeLine, type TotalDisasterConfig } from './evaluator';
import { normalizeNumber, formatNumber } from '../../../utils/number';

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

  const doc = await ensureRefinedGameDoc(gameId);
  if (!doc) {
    return {
      ...baseResult,
      fields: [{ label: 'Target Line', value: formatNumber(line) }],
      unavailableReason: 'Game data unavailable',
    };
  }

  // Extract team scores
  const teams = listTeams(doc);
  const homeTeam = teams.find((t) => (t as any)?.homeAway === 'home') ?? teams[0];
  const awayTeam = teams.find((t) => (t as any)?.homeAway === 'away') ?? teams[1];

  const homeScore = normalizeNumber((homeTeam as any)?.score);
  const awayScore = normalizeNumber((awayTeam as any)?.score);
  const totalPoints = homeScore + awayScore;

  const homeName = typedConfig.home_team_name ?? (homeTeam as any)?.name ?? 'Home';
  const awayName = typedConfig.away_team_name ?? (awayTeam as any)?.name ?? 'Away';

  return {
    ...baseResult,
    fields: [
      { label: homeName, value: homeScore },
      { label: awayName, value: awayScore },
      { label: 'Total Points', value: totalPoints },
      { label: 'Target Line', value: formatNumber(line) },
    ],
  };
}
