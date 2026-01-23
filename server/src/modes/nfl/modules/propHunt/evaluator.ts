import { type PlayerRef } from '../../shared/playerUtils';
import { readPlayerStatValue, resolveStatKey as baseResolveStatKey } from '../../shared/statEvaluatorHelpers';
import type { League } from '../../../../types/league';

export interface PropHuntConfig {
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

export interface PropHuntBaseline {
  statKey: string;
  capturedAt: string;
  gameId: string;
  player: PlayerRef;
  value: number;
}

export interface PendingLineCheck {
  crossed: boolean;
  currentValue: number | null;
}

export interface PropHuntEvaluationResult {
  statKey: string;
  finalValue: number;
  baselineValue: number | null;
  metricValue: number;
}

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

export function normalizePropHuntProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  if (typeof mode === 'string' && mode.trim().toLowerCase() === 'cumulative') {
    return 'cumulative';
  }
  return 'starting_now';
}

export function normalizePropHuntLine(config: PropHuntConfig): number | null {
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

export async function evaluateLineCrossed(
  config: PropHuntConfig,
  line: number,
  progressMode: 'starting_now' | 'cumulative',
): Promise<PendingLineCheck> {
  if (progressMode === 'starting_now') {
    return { crossed: false, currentValue: 0 };
  }
  const statValue = await readStatValueFromAccessors(config);
  if (statValue == null) {
    return { crossed: false, currentValue: null };
  }
  return { crossed: statValue >= line, currentValue: statValue };
}

export async function evaluatePropHunt(
  config: PropHuntConfig,
  progressMode: 'starting_now' | 'cumulative',
  baseline?: PropHuntBaseline | null,
): Promise<PropHuntEvaluationResult | null> {
  const statKey = baseResolveStatKey(config.stat, PLAYER_STAT_MAP);
  if (!statKey) return null;
  const finalValue = await readStatValueFromAccessors(config);
  if (finalValue == null) {
    return null;
  }
  if (progressMode === 'starting_now') {
    if (!baseline) {
      return null;
    }
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

async function readStatValueFromAccessors(config: PropHuntConfig): Promise<number | null> {
  const statKey = baseResolveStatKey(config.stat, PLAYER_STAT_MAP);
  if (!statKey) return null;

  const gameId = config.league_game_id ? String(config.league_game_id) : '';
  if (!gameId) return null;

  const league = config.league ?? 'NFL';
  const value = await readPlayerStatValue(
    league,
    gameId,
    { id: config.player_id, name: config.player_name },
    statKey,
    PLAYER_STAT_MAP,
  );
  return value;
}
