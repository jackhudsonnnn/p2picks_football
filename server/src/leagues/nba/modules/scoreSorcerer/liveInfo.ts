import type { GetLiveInfoInput, ModeLiveInfo } from '../../../types';
import { RedisJsonStore } from '../../../sharedUtils/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import { formatNumber } from '../../../../utils/number';
import {
  getAwayScore,
  getAwayTeam,
  getHomeScore,
  getHomeTeam,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import {
  NBA_SCORE_SORCERER_LABEL,
  NBA_SCORE_SORCERER_MODE_KEY,
  NBA_SCORE_SORCERER_STORE_PREFIX,
} from './constants';
import {
  NbaScoreSorcererBaseline,
  NbaScoreSorcererConfig,
  homeChoiceLabel,
  awayChoiceLabel,
} from './evaluator';

const league: League = 'NBA';

const redis = getRedisClient();
const baselineStore = new RedisJsonStore<NbaScoreSorcererBaseline>(redis, NBA_SCORE_SORCERER_STORE_PREFIX, 60 * 60 * 12);

export async function getNbaScoreSorcererLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, leagueGameId } = input;
  const typedConfig = config as NbaScoreSorcererConfig;

  const base: ModeLiveInfo = {
    modeKey: NBA_SCORE_SORCERER_MODE_KEY,
    modeLabel: NBA_SCORE_SORCERER_LABEL,
    fields: [],
  };

  const baseline = await ensureBaseline(betId, typedConfig, leagueGameId);
  const gameId = leagueGameId ?? typedConfig.league_game_id ?? baseline?.gameId ?? null;

  if (!gameId) {
    return { ...base, unavailableReason: 'No game associated with this bet' };
  }

  const snapshot = await buildNbaScoreSorcererSnapshotFromAccessors(gameId, typedConfig);
  if (!snapshot) {
    return { ...base, unavailableReason: 'Game data unavailable' };
  }

  const homeLabel = homeChoiceLabel({ ...typedConfig, home_team_name: snapshot.homeTeamName });
  const awayLabel = awayChoiceLabel({ ...typedConfig, away_team_name: snapshot.awayTeamName });
  const matchupLabel = formatMatchup(snapshot);
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

function formatMatchup(snapshot: NbaScoreSorcererBaseline): string {
  const home = snapshot.homeTeamAbbrev || 'home';
  const away = snapshot.awayTeamAbbrev || 'away';
  return `${home} vs ${away}`;
}

async function buildNbaScoreSorcererSnapshotFromAccessors(
  gameId: string,
  config: NbaScoreSorcererConfig,
): Promise<NbaScoreSorcererBaseline | null> {
  const [homeTeam, awayTeam, homeScoreRaw, awayScoreRaw] = await Promise.all([
    getHomeTeam(league, gameId),
    getAwayTeam(league, gameId),
    getHomeScore(league, gameId),
    getAwayScore(league, gameId),
  ]);

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

async function ensureBaseline(
  betId: string,
  config: NbaScoreSorcererConfig,
  leagueGameId?: string | null,
): Promise<NbaScoreSorcererBaseline | null> {
  const existing = await baselineStore.get(betId);
  if (existing) return existing;

  const gameId = leagueGameId ?? config.league_game_id ?? null;
  if (!gameId) return null;

  const baseline = await buildNbaScoreSorcererSnapshotFromAccessors(gameId, config);
  if (!baseline) return null;

  await baselineStore.set(betId, baseline);
  return baseline;
}
