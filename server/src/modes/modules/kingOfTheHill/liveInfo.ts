import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { ensureRefinedGameDoc } from '../../shared/gameDocProvider';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { formatNumber } from '../../../utils/number';
import { KING_OF_THE_HILL_STAT_KEY_LABELS } from './constants';
import {
  type KingOfTheHillConfig,
  type ProgressRecord,
  readPlayerStat,
  resolveStatKey,
} from './evaluator';

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
  const doc = gameId ? await ensureRefinedGameDoc(gameId) : null;

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

  // If we have live game doc and stat key, update current values
  if (doc && statKey) {
    const p1Ref = { id: typedConfig.player1_id, name: typedConfig.player1_name };
    const p2Ref = { id: typedConfig.player2_id, name: typedConfig.player2_name };
    player1Current = readPlayerStat(doc, p1Ref, statKey);
    player2Current = readPlayerStat(doc, p2Ref, statKey);
  }

  // Calculate delta (progress) for starting_now mode
  const isStartingNow = progressMode === 'starting_now';

  const fields: { label: string; value: string | number }[] = [
    { label: 'Tracking', value: isStartingNow ? 'Starting Now' : 'Cumulative' },
    { label: 'Stat', value: statLabel },
    { label: 'Target', value: Number.isFinite(target) ? formatNumber(target) : 'N/A' },
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
  if (!progress && !doc) {
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
