import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { formatNumber } from '../../../utils/number';
import { getMatchup, getAwayTeam, getHomeTeam } from '../../../services/nflData/nflRefinedDataAccessors';
import { KING_OF_THE_HILL_STAT_KEY_LABELS } from './constants';
import {
  type KingOfTheHillConfig,
  type ProgressRecord,
  resolveStatKey,
} from './evaluator';
import { extractTeamAbbreviation, extractTeamName, getPlayerStat } from '../../../services/nflData/nflRefinedDataAccessors';

// Shared progress store - must use same prefix as validator
const redis = getRedisClient();
const progressStore = new RedisJsonStore<ProgressRecord>(redis, 'kingOfTheHill:progress', 60 * 60 * 12);

export async function getKingOfTheHillLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, nflGameId } = input;
  const typedConfig = config as KingOfTheHillConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: 'king_of_the_hill',
    modeLabel: 'King Of The Hill',
    fields: [],
  };

  // Get player names
  const player1Name = typedConfig.player1_name ?? typedConfig.player1_id ?? 'Player 1';
  const player2Name = typedConfig.player2_name ?? typedConfig.player2_id ?? 'Player 2';

  // Get stat info
  const statKey = resolveStatKey(typedConfig);
  const statLabel = statKey ? (KING_OF_THE_HILL_STAT_KEY_LABELS[statKey] ?? statKey) : 'Stat';

  // Get resolve value (target)
  const resolveValue = typedConfig.resolve_value ?? typedConfig.resolve_value_label ?? null;
  const target = typeof resolveValue === 'number' ? resolveValue : Number(resolveValue);

  // Try to get progress from Redis (contains baselines)
  const progress = await progressStore.get(betId);

  // Get live game data for current values
  const gameId = nflGameId ?? typedConfig.nfl_game_id ?? progress?.gameId ?? null;
  const [homeTeam, awayTeam] = gameId
    ? await Promise.all([getHomeTeam(gameId), getAwayTeam(gameId)])
    : [null, null];

  // Build baseline and current values
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
    const p1Ref = { id: typedConfig.player1_id, name: typedConfig.player1_name };
    const p2Ref = { id: typedConfig.player2_id, name: typedConfig.player2_name };
    player1Current = await readPlayerStatFromAccessors(gameId, p1Ref.id || p1Ref.name, statKey);
    player2Current = await readPlayerStatFromAccessors(gameId, p2Ref.id || p2Ref.name, statKey);
  }

  const isStartingNow = progressMode === 'starting_now';
  const matchupLabel = await getMatchup(gameId || '');
  const trackingLabel = isStartingNow ? 'Starting Now' : 'Cumulative';
  const targetLabel = Number.isFinite(target) ? formatNumber(target) : 'N/A';

  const fields: { label: string; value: string | number }[] = [
    { label: 'Matchup', value: matchupLabel },
    { label: 'Tracking', value: trackingLabel },
    { label: 'Stat', value: statLabel },
    { label: 'Target', value: targetLabel },
  ];

  if (isStartingNow) {
    // Starting Now: show "{baseline} → {current}" format, but only if baselines are captured
    const hasBaselines = typeof player1Baseline === 'number' && typeof player2Baseline === 'number';
    const p1CurrentStr = typeof player1Current === 'number' ? formatNumber(player1Current) : player1Current;
    const p2CurrentStr = typeof player2Current === 'number' ? formatNumber(player2Current) : player2Current;
    
    if (hasBaselines) {
      const p1BaselineStr = formatNumber(player1Baseline as number);
      const p2BaselineStr = formatNumber(player2Baseline as number);
      fields.push({ label: player1Name, value: `${p1BaselineStr} → ${p1CurrentStr}` });
      fields.push({ label: player2Name, value: `${p2BaselineStr} → ${p2CurrentStr}` });
    } else {
      // Baselines not captured yet, just show current values
      fields.push({ label: player1Name, value: p1CurrentStr });
      fields.push({ label: player2Name, value: p2CurrentStr });
    }
  } else {
    // Cumulative: just show current values
    fields.push({ label: player1Name, value: typeof player1Current === 'number' ? formatNumber(player1Current) : player1Current });
    fields.push({ label: player2Name, value: typeof player2Current === 'number' ? formatNumber(player2Current) : player2Current });
  }

  // Add unavailable reason if no progress data
  if (!progress && !gameId) {
    return {
      ...baseResult,
      fields,
      unavailableReason: 'Live tracking data unavailable',
    };
  }

  return {
    ...baseResult,
    fields,
  };
}

async function readPlayerStatFromAccessors(
  gameId: string,
  playerIdOrName: string | null | undefined,
  statKey: string,
): Promise<number> {
  if (!playerIdOrName) return 0;
  // statKey maps to evaluator constants; reuse category/field mapping from evaluator
  const categoryFieldMap: Record<string, { category: string; field: string }> = {
    passingYards: { category: 'passing', field: 'passingYards' },
    passingTouchdowns: { category: 'passing', field: 'passingTouchdowns' },
    rushingYards: { category: 'rushing', field: 'rushingYards' },
    rushingTouchdowns: { category: 'rushing', field: 'rushingTouchdowns' },
    longRushing: { category: 'rushing', field: 'longRushing' },
    receptions: { category: 'receiving', field: 'receptions' },
    receivingYards: { category: 'receiving', field: 'receivingYards' },
    receivingTouchdowns: { category: 'receiving', field: 'receivingTouchdowns' },
    longReception: { category: 'receiving', field: 'longReception' },
    totalTackles: { category: 'defensive', field: 'totalTackles' },
    sacks: { category: 'defensive', field: 'sacks' },
    passesDefended: { category: 'defensive', field: 'passesDefended' },
    interceptions: { category: 'interceptions', field: 'interceptions' },
    kickReturnYards: { category: 'kickReturns', field: 'kickReturnYards' },
    longKickReturn: { category: 'kickReturns', field: 'longKickReturn' },
    puntReturnYards: { category: 'puntReturns', field: 'puntReturnYards' },
    longPuntReturn: { category: 'puntReturns', field: 'longPuntReturn' },
    puntsInside20: { category: 'punting', field: 'puntsInside20' },
    longPunt: { category: 'punting', field: 'longPunt' },
  };
  const spec = categoryFieldMap[statKey];
  if (!spec) return 0;
  const raw = String(playerIdOrName ?? '').trim();
  if (!raw) return 0;
  const looksId = /^\d+$/.test(raw) || raw.includes('-');
  const finalKey = raw.includes(':') ? raw : looksId ? raw : `name:${raw}`;
  return getPlayerStat(gameId, finalKey, spec.category, spec.field);
}
