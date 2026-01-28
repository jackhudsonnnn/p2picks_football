import type { GetLiveInfoInput, ModeLiveInfo } from '../../../types';
import { RedisJsonStore } from '../../../sharedUtils/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import { formatNumber } from '../../../../utils/number';
import { getMatchup, getPlayerStat } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import {
  NBA_PROP_HUNT_LABEL,
  NBA_PROP_HUNT_MODE_KEY,
  NBA_PROP_HUNT_STAT_KEY_LABELS,
  NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY,
  NBA_PROP_HUNT_STORE_PREFIX,
} from './constants';
import type { NbaPropHuntBaseline, NbaPropHuntConfig } from './evaluator';
import { normalizePropHuntLine, normalizePropHuntProgressMode, resolveStatKey } from './evaluator';

const redis = getRedisClient();
const baselineStore = new RedisJsonStore<NbaPropHuntBaseline>(redis, NBA_PROP_HUNT_STORE_PREFIX, 60 * 60 * 12);

export async function getNbaPropHuntLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, leagueGameId } = input;
  const league: League = input.league ?? 'NBA';
  const typedConfig = config as NbaPropHuntConfig;

  const base: ModeLiveInfo = {
    modeKey: NBA_PROP_HUNT_MODE_KEY,
    modeLabel: NBA_PROP_HUNT_LABEL,
    fields: [],
  };

  const statKey = resolveStatKey(typedConfig.stat);
  const statLabel = statKey ? NBA_PROP_HUNT_STAT_KEY_LABELS[statKey] ?? statKey : 'Stat';
  const line = normalizePropHuntLine(typedConfig);
  const lineLabel = line != null ? formatNumber(line) : 'N/A';
  const progressMode = normalizePropHuntProgressMode(typedConfig.progress_mode);

  const baseline = await baselineStore.get(betId);
  const gameId = leagueGameId ?? typedConfig.league_game_id ?? null;
  const matchup = await getMatchup(league, gameId || '');

  let currentValue: number | string = 'N/A';
  if (gameId && statKey) {
    const playerKey = typedConfig.player_id || (typedConfig.player_name ? `name:${typedConfig.player_name}` : null);
    if (playerKey) {
      const category = NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey] || 'stats';
      const value = await getPlayerStat(league, gameId, playerKey, category, statKey);
      if (Number.isFinite(value)) currentValue = Number(value);
    }
  }

  const fields = [
    { label: 'Matchup', value: matchup },
    { label: 'Stat', value: statLabel },
    { label: 'Line', value: lineLabel },
    { label: 'Tracking', value: progressMode === 'starting_now' ? 'Starting Now' : 'Cumulative' },
  ];

  if (progressMode === 'starting_now') {
    const baseVal = baseline?.value;
    const curr = typeof currentValue === 'number' ? currentValue : null;
    if (typeof baseVal === 'number' && curr !== null) {
      fields.push({ label: typedConfig.player_name ?? 'Player', value: `${formatNumber(baseVal)} → ${formatNumber(curr)}` });
      fields.push({ label: 'Progress', value: formatNumber(curr - baseVal) });
    } else if (curr !== null) {
      fields.push({ label: typedConfig.player_name ?? 'Player', value: formatNumber(curr) });
    }
  } else {
    if (typeof currentValue === 'number') {
      fields.push({ label: typedConfig.player_name ?? 'Player', value: formatNumber(currentValue) });
    }
  }

  return { ...base, fields };
}
