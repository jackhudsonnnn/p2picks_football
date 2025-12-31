import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { ensureRefinedGameDoc } from '../../shared/gameDocProvider';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { choiceLabel, formatMatchup } from '../../shared/teamUtils';
import { formatNumber } from '../../../utils/number';
import {
  SCORE_SORCERER_LABEL,
  SCORE_SORCERER_MODE_KEY,
  SCORE_SORCERER_NO_MORE_SCORES,
  SCORE_SORCERER_STORE_PREFIX,
} from './constants';
import {
  ScoreSorcererBaseline,
  ScoreSorcererConfig,
  homeChoiceLabel,
  awayChoiceLabel,
  buildScoreSorcererBaseline,
} from './evaluator';

const redis = getRedisClient();
const baselineStore = new RedisJsonStore<ScoreSorcererBaseline>(redis, SCORE_SORCERER_STORE_PREFIX, 60 * 60 * 12);

export async function getScoreSorcererLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, nflGameId } = input;
  const typedConfig = config as ScoreSorcererConfig;

  const base: ModeLiveInfo = {
    modeKey: SCORE_SORCERER_MODE_KEY,
    modeLabel: SCORE_SORCERER_LABEL,
    fields: [],
  };

  const baseline = await baselineStore.get(betId);
  const gameId = nflGameId ?? typedConfig.nfl_game_id ?? baseline?.gameId ?? null;

  if (!gameId) {
    return { ...base, unavailableReason: 'No game associated with this bet' };
  }

  const doc = await ensureRefinedGameDoc(gameId);
  if (!doc) {
    return { ...base, unavailableReason: 'Game data unavailable' };
  }

  const snapshot = buildScoreSorcererBaseline(doc, typedConfig, gameId, new Date().toISOString());

  const homeLabel = homeChoiceLabel({ ...typedConfig, home_team_name: snapshot.homeTeamName });
  const awayLabel = awayChoiceLabel({ ...typedConfig, away_team_name: snapshot.awayTeamName });

  const matchup = formatMatchup({ doc, homeName: snapshot.homeTeamName, awayName: snapshot.awayTeamName });

  const fields = [
    ...(matchup ? [{ label: 'Matchup', value: matchup }] : []),
    { label: homeLabel, value: formatScore(snapshot.homeScore, baseline?.homeScore) },
    { label: awayLabel, value: formatScore(snapshot.awayScore, baseline?.awayScore) },
  ];


  return { ...base, fields };
}

function formatScore(current: number, baseline?: number): string | number {
  if (baseline === undefined || baseline === null) {
    return formatNumber(current);
  }
  return `${formatNumber(baseline)} → ${formatNumber(current)}`;
}
