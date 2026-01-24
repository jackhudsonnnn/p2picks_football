import type { GetLiveInfoInput, ModeLiveInfo } from '../../../sharedUtils/types';
import { RedisJsonStore } from '../../../sharedUtils/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import { formatNumber } from '../../../../utils/number';
import { STAT_KEY_LABELS } from '../../utils/statConstants';
import {
  type EitherOrConfig,
  type EitherOrBaseline,
} from './evaluator';
import {
  getAwayTeam,
  getHomeTeam,
  getPlayerStat,
  getMatchup,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { type PlayerRef } from '../../utils/playerUtils';

// Shared baseline store - must use same prefix as validator
const redis = getRedisClient();
const baselineStore = new RedisJsonStore<EitherOrBaseline>(redis, 'eitherOr:baseline', 60 * 60 * 12);

// Player stat map for reading current values
const PLAYER_STAT_MAP: Record<string, { category: string; field: string }> = {
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
};

export async function getEitherOrLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, leagueGameId, league } = input;
  const typedConfig = config as EitherOrConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: 'either_or',
    modeLabel: 'Either Or',
    fields: [],
  };

  // Get player names
  const player1Name = typedConfig.player1_name ?? typedConfig.player1_id ?? 'Player 1';
  const player2Name = typedConfig.player2_name ?? typedConfig.player2_id ?? 'Player 2';

  // Get stat info
  const statKey = (typedConfig.stat || '').trim();
  const statLabel = statKey ? (STAT_KEY_LABELS[statKey] ?? statKey) : 'Stat';

  // Get progress mode
  const progressMode = normalizeProgressMode(typedConfig.progress_mode);
  const isStartingNow = progressMode === 'starting_now';

  // Try to get baseline from Redis
  const baseline = await baselineStore.get(betId);

  // Get live game data for current values
  const gameId = leagueGameId ?? typedConfig.league_game_id ?? baseline?.gameId ?? null;
  const [homeTeam, awayTeam] = gameId
    ? await Promise.all([getHomeTeam(league, gameId), getAwayTeam(league, gameId)])
    : [null, null];

  // Build baseline and current values
  let player1Baseline: number | string = 'N/A';
  let player2Baseline: number | string = 'N/A';
  let player1Current: number | string = 'N/A';
  let player2Current: number | string = 'N/A';

  if (baseline) {
    player1Baseline = baseline.player1.value;
    player2Baseline = baseline.player2.value;
  }

  if (gameId && statKey) {
    const p1Ref: PlayerRef = { id: typedConfig.player1_id, name: typedConfig.player1_name };
    const p2Ref: PlayerRef = { id: typedConfig.player2_id, name: typedConfig.player2_name };
    player1Current = await readPlayerStatFromAccessors(league, gameId, p1Ref, statKey);
    player2Current = await readPlayerStatFromAccessors(league, gameId, p2Ref, statKey);
  }

  // Calculate progress for starting_now mode
  let player1Progress: number | null = null;
  let player2Progress: number | null = null;

  if (isStartingNow && typeof player1Baseline === 'number' && typeof player1Current === 'number') {
    player1Progress = player1Current - player1Baseline;
  }
  if (isStartingNow && typeof player2Baseline === 'number' && typeof player2Current === 'number') {
    player2Progress = player2Current - player2Baseline;
  }

  const matchupLabel = await getMatchup(league, gameId || '');
  const fields: { label: string; value: string | number }[] = [
    { label: 'Matchup', value: matchupLabel },
    { label: 'Tracking', value: isStartingNow ? 'Starting Now' : 'Cumulative' },
    { label: 'Stat', value: statLabel },
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

async function readPlayerStatFromAccessors(league: League, gameId: string, ref: PlayerRef, statKey: string): Promise<number> {
  const spec = PLAYER_STAT_MAP[statKey];
  if (!spec) return 0;
  const idOrName = ref.id || (ref.name ? `name:${ref.name}` : null);
  if (!idOrName) return 0;
  const value = await getPlayerStat(league, gameId, idOrName, spec.category, spec.field);
  return value ?? 0;
}

function normalizeProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  return normalized === 'starting_now' ? 'starting_now' : 'cumulative';
}