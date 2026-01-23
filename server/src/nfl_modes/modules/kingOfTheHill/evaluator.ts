import { type PlayerRef } from '../../shared/playerUtils';
import { readPlayerStatValue, resolvePlayerKey, resolveStatKey as baseResolveStatKey } from '../../shared/statEvaluatorHelpers';

export interface KingOfTheHillConfig {
  player1_id?: string | null;
  player1_name?: string | null;
  player2_id?: string | null;
  player2_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  league_game_id?: string | null;
  resolve_value?: number | null;
  resolve_value_label?: string | null;
  progress_mode?: string | null;
}

export interface PlayerProgress {
  id?: string | null;
  name?: string | null;
  baselineValue: number;
  lastValue: number;
  reached: boolean;
  reachedAt: string | null;
  valueAtReach: number | null;
  deltaAtReach: number | null;
  metricAtReach: number | null;
}

export interface ProgressRecord {
  statKey: string;
  threshold: number;
  gameId: string;
  capturedAt: string;
  progressMode: 'starting_now' | 'cumulative';
  player1: PlayerProgress;
  player2: PlayerProgress;
}

export type ProgressOutcome = 'player1' | 'player2' | 'tie' | 'none';

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
  interceptions: { category: 'interceptions', field: 'interceptions' },
  kickReturnYards: { category: 'kickReturns', field: 'kickReturnYards' },
  longKickReturn: { category: 'kickReturns', field: 'longKickReturn' },
  puntReturnYards: { category: 'puntReturns', field: 'puntReturnYards' },
  longPuntReturn: { category: 'puntReturns', field: 'longPuntReturn' },
  puntsInside20: { category: 'punting', field: 'puntsInside20' },
  longPunt: { category: 'punting', field: 'longPunt' },
};

export function resolveStatKey(config: KingOfTheHillConfig | null | undefined): string | null {
  return baseResolveStatKey(config?.stat, PLAYER_STAT_MAP);
}

export async function readPlayerStat(gameId: string, ref: PlayerRef, statKey: string): Promise<number> {
  const value = await readPlayerStatValue(gameId, ref, statKey, PLAYER_STAT_MAP);
  return value ?? 0;
}

export function createPlayerProgress(id?: string | null, name?: string | null, baselineValue = 0): PlayerProgress {
  return {
    id,
    name,
    baselineValue,
    lastValue: baselineValue,
    reached: false,
    reachedAt: null,
    valueAtReach: null,
    deltaAtReach: null,
    metricAtReach: null,
  };
}

export async function buildProgressRecord(
  config: KingOfTheHillConfig,
  statKey: string,
  threshold: number,
  progressMode: 'starting_now' | 'cumulative',
  gameId: string,
  capturedAt: string = new Date().toISOString(),
): Promise<ProgressRecord> {
  const player1Ref: PlayerRef = { id: config.player1_id, name: config.player1_name };
  const player2Ref: PlayerRef = { id: config.player2_id, name: config.player2_name };
  const [player1Value, player2Value] = await Promise.all([
    readPlayerStat(gameId, player1Ref, statKey),
    readPlayerStat(gameId, player2Ref, statKey),
  ]);
  return {
    statKey,
    threshold,
    gameId,
    capturedAt,
    progressMode,
    player1: createPlayerProgress(config.player1_id, config.player1_name, player1Value),
    player2: createPlayerProgress(config.player2_id, config.player2_name, player2Value),
  };
}

export function applyProgressUpdate(
  progress: ProgressRecord,
  progressMode: 'starting_now' | 'cumulative',
  threshold: number,
  player1Value: number,
  player2Value: number,
  timestamp: string,
): ProgressRecord {
  const player1 = updatePlayerProgress(progress.player1, player1Value, progressMode, threshold, timestamp);
  const player2 = updatePlayerProgress(progress.player2, player2Value, progressMode, threshold, timestamp);
  return {
    ...progress,
    progressMode,
    player1,
    player2,
  };
}

export function determineProgressOutcome(progress: ProgressRecord): ProgressOutcome {
  const player1Reached = progress.player1.reached;
  const player2Reached = progress.player2.reached;
  if (player1Reached && !player2Reached) {
    return 'player1';
  }
  if (player2Reached && !player1Reached) {
    return 'player2';
  }
  if (player1Reached && player2Reached) {
    const resolved = resolveSimultaneousFinish(progress);
    if (resolved === 'tie') {
      return 'tie';
    }
    return resolved === 'player1' ? 'player1' : 'player2';
  }
  return 'none';
}

function updatePlayerProgress(
  current: PlayerProgress,
  latestValue: number,
  progressMode: 'starting_now' | 'cumulative',
  threshold: number,
  timestamp: string,
): PlayerProgress {
  const baseline = ensureBaselineValue(current, latestValue);
  const delta = computeDelta(latestValue, baseline);
  const metric = progressMode === 'starting_now' ? delta : latestValue;
  if (current.reached) {
    return {
      ...current,
      baselineValue: baseline,
      lastValue: latestValue,
    };
  }
  if (metric >= threshold) {
    return {
      ...current,
      baselineValue: baseline,
      lastValue: latestValue,
      reached: true,
      reachedAt: timestamp,
      valueAtReach: latestValue,
      deltaAtReach: delta,
      metricAtReach: metric,
    };
  }
  return {
    ...current,
    baselineValue: baseline,
    lastValue: latestValue,
  };
}

function resolveSimultaneousFinish(progress: ProgressRecord): 'player1' | 'player2' | 'tie' {
  const ts1 = progress.player1.reachedAt ? Date.parse(progress.player1.reachedAt) : NaN;
  const ts2 = progress.player2.reachedAt ? Date.parse(progress.player2.reachedAt) : NaN;
  if (Number.isFinite(ts1) && Number.isFinite(ts2) && ts1 !== ts2) {
    return ts1 < ts2 ? 'player1' : 'player2';
  }
  const metric1 = metricFromProgress(progress.player1, progress.progressMode);
  const metric2 = metricFromProgress(progress.player2, progress.progressMode);
  if (metric1 != null && metric2 != null && metric1 !== metric2) {
    return metric1 > metric2 ? 'player1' : 'player2';
  }
  const value1 = valueFromProgress(progress.player1);
  const value2 = valueFromProgress(progress.player2);
  if (value1 != null && value2 != null && value1 !== value2) {
    return value1 > value2 ? 'player1' : 'player2';
  }
  return 'tie';
}

function ensureBaselineValue(player: PlayerProgress | undefined, fallback: number): number {
  if (player && Number.isFinite(player.baselineValue)) {
    return player.baselineValue;
  }
  return Number.isFinite(fallback) ? fallback : 0;
}

function computeDelta(current: number, baseline: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return 0;
  return Math.max(0, current - baseline);
}

function metricFromProgress(player: PlayerProgress, progressMode: 'starting_now' | 'cumulative'): number | null {
  if (typeof player.metricAtReach === 'number' && Number.isFinite(player.metricAtReach)) {
    return player.metricAtReach;
  }
  if (progressMode === 'starting_now') {
    return deltaFromProgress(player);
  }
  return valueFromProgress(player);
}

function valueFromProgress(player: PlayerProgress): number | null {
  if (typeof player.valueAtReach === 'number' && Number.isFinite(player.valueAtReach)) {
    return player.valueAtReach;
  }
  if (typeof player.lastValue === 'number' && Number.isFinite(player.lastValue)) {
    return player.lastValue;
  }
  return null;
}

function deltaFromProgress(player: PlayerProgress): number | null {
  if (typeof player.deltaAtReach === 'number' && Number.isFinite(player.deltaAtReach)) {
    return player.deltaAtReach;
  }
  if (typeof player.valueAtReach === 'number' && Number.isFinite(player.valueAtReach)) {
    return Math.max(0, player.valueAtReach - (player.baselineValue ?? 0));
  }
  if (typeof player.lastValue === 'number' && Number.isFinite(player.lastValue)) {
    return Math.max(0, player.lastValue - (player.baselineValue ?? 0));
  }
  return null;
}
