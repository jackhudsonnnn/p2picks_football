import { NBA_STAT_KEY_TO_CATEGORY, NBA_STAT_KEY_LABELS, NBA_STAT_KEY_RANGES, NBA_DEFAULT_STAT_RANGE } from '../../utils/statConstants';

export const NBA_KOTH_MODE_KEY = 'nba_king_of_the_hill';
export const NBA_KOTH_LABEL = 'King Of The Hill';
export const NBA_KOTH_CHANNEL = 'nba-king-of-the-hill-pending';
export const NBA_KOTH_STORE_PREFIX = 'nbaKingOfTheHill:progress';
export const NBA_KOTH_RESULT_EVENT = 'nba_king_of_the_hill_result';
export const NBA_KOTH_SNAPSHOT_EVENT = 'nba_king_of_the_hill_snapshot';

export const NBA_KOTH_STAT_KEY_TO_CATEGORY = NBA_STAT_KEY_TO_CATEGORY;
export const NBA_KOTH_STAT_KEY_LABELS = NBA_STAT_KEY_LABELS;

export const NBA_KOTH_MIN_RESOLVE_VALUE = 1;
export const NBA_KOTH_MAX_RESOLVE_VALUE = 150;
export const NBA_KOTH_DEFAULT_RESOLVE_VALUE = 30;

export const NBA_KOTH_ALLOWED_RESOLVE_VALUES = Array.from(
  { length: NBA_KOTH_MAX_RESOLVE_VALUE - NBA_KOTH_MIN_RESOLVE_VALUE + 1 },
  (_, index) => NBA_KOTH_MIN_RESOLVE_VALUE + index,
);

export function getStatResolveRange(statKey: string | null | undefined): { min: number; max: number } {
  if (!statKey) {
    return { min: NBA_KOTH_MIN_RESOLVE_VALUE, max: NBA_KOTH_MAX_RESOLVE_VALUE };
  }
  const range = NBA_STAT_KEY_RANGES[statKey] || NBA_DEFAULT_STAT_RANGE;
  return {
    min: NBA_KOTH_MIN_RESOLVE_VALUE,
    max: Math.max(NBA_KOTH_MIN_RESOLVE_VALUE, Math.floor(range.max)),
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
  return NBA_KOTH_DEFAULT_RESOLVE_VALUE;
}

export function isValidResolveValue(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return value >= NBA_KOTH_MIN_RESOLVE_VALUE && value <= NBA_KOTH_MAX_RESOLVE_VALUE;
}

function applyResolveBounds(value: number): number {
  const rounded = Math.round(value);
  if (rounded < NBA_KOTH_MIN_RESOLVE_VALUE) return NBA_KOTH_MIN_RESOLVE_VALUE;
  if (rounded > NBA_KOTH_MAX_RESOLVE_VALUE) return NBA_KOTH_MAX_RESOLVE_VALUE;
  return rounded;
}
