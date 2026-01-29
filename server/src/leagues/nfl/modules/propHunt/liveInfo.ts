import type { GetLiveInfoInput, ModeLiveInfo } from '../../../sharedUtils/types';
import { RedisJsonStore } from '../../../sharedUtils/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import { formatNumber } from '../../../../utils/number';
import {
  STAT_KEY_LABELS,
  PLAYER_STAT_MAP,
  PROP_HUNT_MODE_KEY,
  PROP_HUNT_LABEL,
  PROP_HUNT_STORE_PREFIX,
} from './constants';
import {
  type PropHuntConfig,
  type PropHuntBaseline,
  normalizePropHuntLine,
  normalizePropHuntProgressMode,
} from './evaluator';
import {
  getAwayTeam,
  getHomeTeam,
  getPlayerStat,
  getMatchup,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';

// Shared baseline store - must use same prefix as validator
const redis = getRedisClient();
const baselineStore = new RedisJsonStore<PropHuntBaseline>(redis, PROP_HUNT_STORE_PREFIX, 60 * 60 * 12);

export async function getPropHuntLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, leagueGameId, league } = input;
  const typedConfig = config as PropHuntConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: PROP_HUNT_MODE_KEY,
    modeLabel: PROP_HUNT_LABEL,
    fields: [],
  };

  // Get player name
  const playerName = typedConfig.player_name ?? typedConfig.player_id ?? 'Player';

  // Get stat info
  const statKey = (typedConfig.stat || '').trim();
  const statLabel = statKey ? (STAT_KEY_LABELS[statKey] ?? statKey) : 'Stat';

  // Get line
  const line = normalizePropHuntLine(typedConfig);
  const lineDisplay = line !== null ? formatNumber(line) : 'N/A';

  // Get progress mode
  const progressMode = normalizePropHuntProgressMode(typedConfig.progress_mode);
  const isStartingNow = progressMode === 'starting_now';

  // Try to get baseline from Redis
  const baseline = await baselineStore.get(betId);

  // Get live game data for current value
  const gameId = leagueGameId ?? typedConfig.league_game_id ?? null;
  const [homeTeam, awayTeam] = gameId
    ? await Promise.all([getHomeTeam(league, gameId), getAwayTeam(league, gameId)])
    : [null, null];

  // Build baseline and current values
  let baselineValue: number | string = 'N/A';
  let currentValue: number | string = 'N/A';

  if (baseline) {
    baselineValue = baseline.value;
  }

  if (gameId) {
    const statValue = await readStatValueFromAccessors(league, gameId, typedConfig);
    if (statValue !== null) {
      currentValue = statValue;
    }
  }

  // Calculate progress for starting_now mode
  let progress: number | null = null;
  if (isStartingNow && typeof baselineValue === 'number' && typeof currentValue === 'number') {
    progress = currentValue - baselineValue;
  }

  const matchup = await getMatchup(league, gameId || '');
  const trackingLabel = isStartingNow ? 'Starting Now' : 'Cumulative';
  
  const fields: { label: string; value: string | number }[] = [
    { label: 'Matchup', value: matchup },
    { label: 'Tracking', value: trackingLabel },
    { label: 'Stat', value: statLabel },
    { label: 'Line', value: lineDisplay },
  ];

  if (isStartingNow) {
    const hasBaseline = typeof baselineValue === 'number';
    const currentStr = typeof currentValue === 'number' ? formatNumber(currentValue) : currentValue;
    
    if (hasBaseline) {
      const baselineStr = formatNumber(baselineValue as number);
      fields.push({ label: playerName, value: `${baselineStr} → ${currentStr}` });
      
      // Add progress
      if (progress !== null) {
        fields.push({ label: 'Progress', value: formatNumber(progress) });
      }
    } else {
      // Baseline not captured yet, just show current
      fields.push({ label: playerName, value: currentStr });
    }
  } else {
    // Cumulative: just show current value
    fields.push({ label: playerName, value: typeof currentValue === 'number' ? formatNumber(currentValue) : currentValue });
  }

  // Add unavailable reason if no data
  if (!baseline && !gameId) {
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

async function readStatValueFromAccessors(league: League, gameId: string, config: PropHuntConfig): Promise<number | null> {
  const statKey = (config.stat || '').trim();
  const spec = PLAYER_STAT_MAP[statKey];
  if (!spec) return null;
  const playerId = config.player_id || (config.player_name ? `name:${config.player_name}` : null);
  if (!playerId) return null;
  const value = await getPlayerStat(league, gameId, playerId, spec.category, spec.field);
  return Number.isFinite(value) ? value : null;
}
