import {
  STAT_KEY_TO_CATEGORY as SHARED_STAT_KEY_TO_CATEGORY,
  STAT_KEY_LABELS as SHARED_STAT_KEY_LABELS,
  ALLOWED_RESOLVE_AT,
  DEFAULT_RESOLVE_AT,
  getStatRange,
  DEFAULT_STAT_RANGE,
} from '../../utils/statConstants';

export const PROP_HUNT_ALLOWED_RESOLVE_AT = [...ALLOWED_RESOLVE_AT];
export const PROP_HUNT_DEFAULT_RESOLVE_AT = DEFAULT_RESOLVE_AT;

export const STAT_KEY_TO_CATEGORY = SHARED_STAT_KEY_TO_CATEGORY;
export const STAT_KEY_LABELS = SHARED_STAT_KEY_LABELS;

export const PROP_HUNT_LINE_RANGE = DEFAULT_STAT_RANGE;

export { getStatRange };

export const PROP_HUNT_DEBUG_FLAG = 'DEBUG_PROP_HUNT';

export const PROP_HUNT_MODE_KEY = 'nfl_prop_hunt';
export const PROP_HUNT_LABEL = 'Prop Hunt';
export const PROP_HUNT_CHANNEL = 'prop-hunt-pending';
export const PROP_HUNT_STORE_PREFIX = 'propHunt:baseline';
export const PROP_HUNT_RESULT_EVENT = 'prop_hunt_result';
export const PROP_HUNT_BASELINE_EVENT = 'prop_hunt_baseline';

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
