import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { formatNumber } from '../../../utils/number';
import {
  extractTeamAbbreviation,
  extractTeamId,
  extractTeamName,
  getAwayScore,
  getAwayTeam,
  getHomeScore,
  getHomeTeam,
  getMatchup,
} from '../../../services/nflData/nflRefinedDataAccessors';
import {
  SCORE_SORCERER_LABEL,
  SCORE_SORCERER_MODE_KEY,
  SCORE_SORCERER_STORE_PREFIX,
} from './constants';
import {
  ScoreSorcererBaseline,
  ScoreSorcererConfig,
  homeChoiceLabel,
  awayChoiceLabel,
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

  const snapshot = await buildScoreSorcererSnapshotFromAccessors(gameId, typedConfig);
  if (!snapshot) {
    return { ...base, unavailableReason: 'Game data unavailable' };
  }

  const homeLabel = homeChoiceLabel({ ...typedConfig, home_team_name: snapshot.homeTeamName });
  const awayLabel = awayChoiceLabel({ ...typedConfig, away_team_name: snapshot.awayTeamName });
  const matchupLabel = await getMatchup(gameId);
  const fields = [
    { label: 'Matchup', value: matchupLabel },
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

async function buildScoreSorcererSnapshotFromAccessors(
  gameId: string,
  config: ScoreSorcererConfig,
): Promise<ScoreSorcererBaseline | null> {
  const [homeTeam, awayTeam, homeScoreRaw, awayScoreRaw] = await Promise.all([
    getHomeTeam(gameId),
    getAwayTeam(gameId),
    getHomeScore(gameId),
    getAwayScore(gameId),
  ]);

  if (!homeTeam && !awayTeam) return null;

  return {
    gameId,
    capturedAt: new Date().toISOString(),
    homeScore: Number(homeScoreRaw) || 0,
    awayScore: Number(awayScoreRaw) || 0,
    homeTeamId: extractTeamId(homeTeam) ?? config.home_team_id ?? null,
    awayTeamId: extractTeamId(awayTeam) ?? config.away_team_id ?? null,
    homeTeamName: extractTeamName(homeTeam) ?? config.home_team_name ?? null,
    awayTeamName: extractTeamName(awayTeam) ?? config.away_team_name ?? null,
    homeTeamAbbrev: extractTeamAbbreviation(homeTeam) ?? config.home_team_abbrev ?? null,
    awayTeamAbbrev: extractTeamAbbreviation(awayTeam) ?? config.away_team_abbrev ?? null,
  };
}
