import { STAT_KEY_TO_CATEGORY, STAT_KEY_LABELS, STAT_KEY_RANGES, DEFAULT_STAT_RANGE } from '../../utils/statConstants';

export const KING_OF_THE_HILL_MODE_KEY = 'nfl_king_of_the_hill';
export const KING_OF_THE_HILL_LABEL = 'King of the Hill';
export const KING_OF_THE_HILL_CHANNEL = 'king-of-the-hill-pending';
export const KING_OF_THE_HILL_STORE_PREFIX = 'kingOfTheHill:progress';
export const KING_OF_THE_HILL_RESULT_EVENT = 'king_of_the_hill_result';
export const KING_OF_THE_HILL_BASELINE_EVENT = 'king_of_the_hill_baseline';

export const PLAYER_STAT_MAP: Record<string, { category: string; field: string }> = {
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

export const KING_OF_THE_HILL_STAT_KEY_TO_CATEGORY = STAT_KEY_TO_CATEGORY;
export const KING_OF_THE_HILL_STAT_KEY_LABELS = STAT_KEY_LABELS;

export const KING_OF_THE_HILL_MIN_RESOLVE_VALUE = 1;
export const KING_OF_THE_HILL_MAX_RESOLVE_VALUE = 499;
export const KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE = 100;

export const KING_OF_THE_HILL_ALLOWED_RESOLVE_VALUES = Array.from({ length: KING_OF_THE_HILL_MAX_RESOLVE_VALUE - KING_OF_THE_HILL_MIN_RESOLVE_VALUE + 1 }, (_, index) =>
  KING_OF_THE_HILL_MIN_RESOLVE_VALUE + index,
);

export function getStatResolveRange(statKey: string | null | undefined): { min: number; max: number } {
  if (!statKey) {
    return { min: KING_OF_THE_HILL_MIN_RESOLVE_VALUE, max: KING_OF_THE_HILL_MAX_RESOLVE_VALUE };
  }
  const range = STAT_KEY_RANGES[statKey] || DEFAULT_STAT_RANGE;
  // Convert from .5 values to integer resolve values (e.g., 599.5 -> 599)
  return {
    min: KING_OF_THE_HILL_MIN_RESOLVE_VALUE,
    max: Math.floor(range.max),
  };
}

export function getAllowedResolveValuesForStat(statKey: string | null | undefined): number[] {
  const { min, max } = getStatResolveRange(statKey);
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function clampResolveValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return applyResolveBounds(value);
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return applyResolveBounds(parsed);
    }
  }
  return KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE;
}

export function isValidResolveValue(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return value >= KING_OF_THE_HILL_MIN_RESOLVE_VALUE && value <= KING_OF_THE_HILL_MAX_RESOLVE_VALUE;
}

function applyResolveBounds(value: number): number {
  const rounded = Math.round(value);
  if (rounded < KING_OF_THE_HILL_MIN_RESOLVE_VALUE) {
    return KING_OF_THE_HILL_MIN_RESOLVE_VALUE;
  }
  if (rounded > KING_OF_THE_HILL_MAX_RESOLVE_VALUE) {
    return KING_OF_THE_HILL_MAX_RESOLVE_VALUE;
  }
  return rounded;
}
