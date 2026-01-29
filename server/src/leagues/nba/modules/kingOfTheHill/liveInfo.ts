import type { GetLiveInfoInput, ModeLiveInfo } from '../../../sharedUtils/types';
import { RedisJsonStore } from '../../../sharedUtils/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import { formatNumber } from '../../../../utils/number';
import { getMatchup, getAwayTeam, getHomeTeam, getPlayerStat } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { NBA_KOTH_STAT_KEY_LABELS, NBA_KOTH_STORE_PREFIX, NBA_KOTH_MODE_KEY, NBA_KOTH_LABEL } from './constants';
import { type KingOfTheHillConfig, type ProgressRecord, resolveStatKey } from './evaluator';

const redis = getRedisClient();
const progressStore = new RedisJsonStore<ProgressRecord>(redis, NBA_KOTH_STORE_PREFIX, 60 * 60 * 12);

const PLAYER_STAT_MAP: Record<string, { category: string; field: string }> = {
  points: { category: 'stats', field: 'points' },
  rebounds: { category: 'stats', field: 'rebounds' },
  assists: { category: 'stats', field: 'assists' },
  steals: { category: 'stats', field: 'steals' },
  blocks: { category: 'stats', field: 'blocks' },
  turnovers: { category: 'stats', field: 'turnovers' },
  threePointersMade: { category: 'stats', field: 'threePointersMade' },
  freeThrowsMade: { category: 'stats', field: 'freeThrowsMade' },
};

export async function getKingOfTheHillLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, leagueGameId, league } = input;
  const typedConfig = config as KingOfTheHillConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: NBA_KOTH_MODE_KEY,
    modeLabel: NBA_KOTH_LABEL,
    fields: [],
  };

  const player1Name = typedConfig.player1_name ?? typedConfig.player1_id ?? 'Player 1';
  const player2Name = typedConfig.player2_name ?? typedConfig.player2_id ?? 'Player 2';

  const statKey = resolveStatKey(typedConfig);
  const statLabel = statKey ? NBA_KOTH_STAT_KEY_LABELS[statKey] ?? statKey : 'Stat';

  const resolveValue = typedConfig.resolve_value ?? typedConfig.resolve_value_label ?? null;
  const target = typeof resolveValue === 'number' ? resolveValue : Number(resolveValue);

  const progress = await progressStore.get(betId);

  const gameId = leagueGameId ?? typedConfig.league_game_id ?? progress?.gameId ?? null;
  const [homeTeam, awayTeam] = gameId
    ? await Promise.all([getHomeTeam(league, gameId), getAwayTeam(league, gameId)])
    : [null, null];

  let player1Baseline: number | string = 'N/A';
  let player2Baseline: number | string = 'N/A';
  let player1Current: number | string = 'N/A';
  let player2Current: number | string = 'N/A';
  let progressMode = typedConfig.progress_mode ?? 'cumulative';

  if (progress) {
    player1Baseline = progress.player1.baselineValue;
    player2Baseline = progress.player2.baselineValue;
    player1Current = progress.player1.lastValue;
    player2Current = progress.player2.lastValue;
    progressMode = progress.progressMode;
  }

  if (gameId && statKey) {
    player1Current = await readPlayerStatFromAccessors(league, gameId, typedConfig.player1_id || typedConfig.player1_name, statKey);
    player2Current = await readPlayerStatFromAccessors(league, gameId, typedConfig.player2_id || typedConfig.player2_name, statKey);
  }

  const isStartingNow = progressMode === 'starting_now';
  const matchupLabel = await getMatchup(league, gameId || '');
  const trackingLabel = isStartingNow ? 'Starting Now' : 'Cumulative';
  const targetLabel = Number.isFinite(target) ? formatNumber(target as number) : 'N/A';

  const fields: { label: string; value: string | number }[] = [
    { label: 'Matchup', value: matchupLabel },
    { label: 'Tracking', value: trackingLabel },
    { label: 'Stat', value: statLabel },
    { label: 'Target', value: targetLabel },
  ];

  if (isStartingNow) {
    const hasBaselines = typeof player1Baseline === 'number' && typeof player2Baseline === 'number';
    const p1CurrentStr = typeof player1Current === 'number' ? formatNumber(player1Current) : player1Current;
    const p2CurrentStr = typeof player2Current === 'number' ? formatNumber(player2Current) : player2Current;

    if (hasBaselines) {
      const p1BaselineStr = formatNumber(player1Baseline as number);
      const p2BaselineStr = formatNumber(player2Baseline as number);
      fields.push({ label: player1Name, value: `${p1BaselineStr} → ${p1CurrentStr}` });
      fields.push({ label: player2Name, value: `${p2BaselineStr} → ${p2CurrentStr}` });
    } else {
      fields.push({ label: player1Name, value: p1CurrentStr });
      fields.push({ label: player2Name, value: p2CurrentStr });
    }
  } else {
    fields.push({ label: player1Name, value: typeof player1Current === 'number' ? formatNumber(player1Current) : player1Current });
    fields.push({ label: player2Name, value: typeof player2Current === 'number' ? formatNumber(player2Current) : player2Current });
  }

  if (!progress && !gameId) {
    return { ...baseResult, fields, unavailableReason: 'Live tracking data unavailable' };
  }

  return { ...baseResult, fields };
}

async function readPlayerStatFromAccessors(
  league: League,
  gameId: string,
  playerIdOrName: string | null | undefined,
  statKey: string,
): Promise<number> {
  if (!playerIdOrName) return 0;
  const spec = PLAYER_STAT_MAP[statKey];
  if (!spec) return 0;
  const raw = String(playerIdOrName ?? '').trim();
  if (!raw) return 0;
  const looksId = /^\d+$/.test(raw) || raw.includes('-');
  const finalKey = raw.includes(':') ? raw : looksId ? raw : `name:${raw}`;
  const value = await getPlayerStat(league, gameId, finalKey, spec.category, spec.field);
  return value ?? 0;
}
