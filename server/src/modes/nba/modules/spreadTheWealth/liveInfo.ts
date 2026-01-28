import type { GetLiveInfoInput, ModeLiveInfo } from '../../../types';
import { formatNumber } from '../../../../utils/number';
import { getScores, getMatchup } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { describeSpread, normalizeSpread } from './evaluator';
import { NBA_SPREAD_THE_WEALTH_LABEL, NBA_SPREAD_THE_WEALTH_MODE_KEY } from './constants';

export async function getNbaSpreadTheWealthLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { config, leagueGameId } = input;
  const league: League = input.league ?? 'NBA';
  const typedConfig = config as any;

  const base: ModeLiveInfo = {
    modeKey: NBA_SPREAD_THE_WEALTH_MODE_KEY,
    modeLabel: NBA_SPREAD_THE_WEALTH_LABEL,
    fields: [],
  };

  const spread = normalizeSpread(typedConfig);
  const spreadLabel = describeSpread(typedConfig) ?? 'N/A';
  if (spread == null) {
    return { ...base, fields: [{ label: 'Spread', value: spreadLabel }], unavailableReason: 'Invalid spread' };
  }

  const gameId = leagueGameId ?? typedConfig.league_game_id ?? null;
  if (!gameId) {
    return { ...base, fields: [{ label: 'Spread', value: spreadLabel }], unavailableReason: 'No game associated with this bet' };
  }

  const [scores, matchup] = await Promise.all([getScores(league, gameId), getMatchup(league, gameId)]);
  const adjustedHome = (Number(scores.home) || 0) + spread;

  const fields = [
    { label: 'Matchup', value: matchup },
    { label: 'Home (adj)', value: `${formatNumber(scores.home)} → ${formatNumber(adjustedHome)}` },
    { label: 'Away', value: formatNumber(scores.away) },
    { label: 'Spread', value: spreadLabel },
  ];

  return { ...base, fields };
}
