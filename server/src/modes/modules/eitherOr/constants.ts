import {
  STAT_KEY_TO_CATEGORY as SHARED_STAT_KEY_TO_CATEGORY,
  STAT_KEY_LABELS as SHARED_STAT_KEY_LABELS,
  ALLOWED_RESOLVE_AT as SHARED_ALLOWED_RESOLVE_AT,
  DEFAULT_RESOLVE_AT as SHARED_DEFAULT_RESOLVE_AT,
} from '../../shared/statConstants';

export const STAT_KEY_TO_CATEGORY = SHARED_STAT_KEY_TO_CATEGORY;
export const STAT_KEY_LABELS = SHARED_STAT_KEY_LABELS;
export const EITHER_OR_ALLOWED_RESOLVE_AT: string[] = [...SHARED_ALLOWED_RESOLVE_AT];
export const EITHER_OR_DEFAULT_RESOLVE_AT = SHARED_DEFAULT_RESOLVE_AT;

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
};
