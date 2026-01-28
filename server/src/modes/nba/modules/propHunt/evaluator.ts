import { getPlayerStat } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { formatNumber, isApproximatelyEqual } from '../../../../utils/number';
import { resolvePlayerKey } from '../../utils/playerUtils';
import { NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY } from './constants';

export interface NbaPropHuntConfig {
  player_id?: string | null;
  player_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  league_game_id?: string | null;
  league?: League | null;
  resolve_at?: string | null;
  progress_mode?: string | null;
}

export interface NbaPropHuntBaseline {
  statKey: string;
  capturedAt: string;
  gameId: string;
  player: { id?: string | null; name?: string | null };
  value: number;
}

export interface NbaPropHuntEvaluationResult {
  statKey: string;
  finalValue: number;
  baselineValue: number | null;
  metricValue: number;
}

export function normalizePropHuntProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  if (typeof mode === 'string' && mode.trim().toLowerCase() === 'cumulative') {
    return 'cumulative';
  }
  return 'starting_now';
}

export function normalizePropHuntLine(config: NbaPropHuntConfig): number | null {
  if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
    return config.line_value;
  }
  if (typeof config.line === 'string') {
    const parsed = Number.parseFloat(config.line);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export async function evaluateNbaPropHunt(
  config: NbaPropHuntConfig,
  progressMode: 'starting_now' | 'cumulative',
  baseline?: NbaPropHuntBaseline | null,
): Promise<NbaPropHuntEvaluationResult | null> {
  const statKey = resolveStatKey(config.stat);
  if (!statKey) return null;
  const finalValue = await readStatValueFromAccessors(config);
  if (finalValue == null) return null;

  if (progressMode === 'starting_now') {
    if (!baseline) return null;
    return {
      statKey,
      finalValue,
      baselineValue: baseline.value,
      metricValue: finalValue - baseline.value,
    };
  }

  return {
    statKey,
    finalValue,
    baselineValue: null,
    metricValue: finalValue,
  };
}

export function describeLine(config: NbaPropHuntConfig): string | null {
  const label = typeof config.line_label === 'string' ? config.line_label.trim() : '';
  if (label.length) return label;
  if (typeof config.line === 'string' && config.line.trim().length) {
    return config.line.trim();
  }
  if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
    return formatNumber(config.line_value);
  }
  return null;
}

export function resolveStatKey(stat?: string | null): string | null {
  const key = (stat || '').trim();
  if (!key) return null;
  if (!NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[key]) return null;
  return key;
}

async function readStatValueFromAccessors(config: NbaPropHuntConfig): Promise<number | null> {
  const statKey = resolveStatKey(config.stat);
  if (!statKey) return null;
  const gameId = config.league_game_id ? String(config.league_game_id) : '';
  if (!gameId) return null;
  const playerKey = resolvePlayerKey(config.player_id, config.player_name);
  if (!playerKey) return null;
  const category = NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY[statKey] || 'stats';
  const value = await getPlayerStat(config.league ?? 'NBA', gameId, playerKey, category, statKey);
  return Number.isFinite(value) ? Number(value) : null;
}

export function isPush(metricValue: number, line: number): boolean {
  return isApproximatelyEqual(metricValue, line);
}
