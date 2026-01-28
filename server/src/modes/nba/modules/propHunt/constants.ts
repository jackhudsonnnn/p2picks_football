import {
  ALLOWED_RESOLVE_AT as SHARED_ALLOWED_RESOLVE_AT,
  DEFAULT_RESOLVE_AT as SHARED_DEFAULT_RESOLVE_AT,
  NBA_STAT_KEY_LABELS,
  NBA_STAT_KEY_TO_CATEGORY,
  getNbaStatRange,
  NBA_DEFAULT_STAT_RANGE,
} from '../../utils/statConstants';

export const NBA_PROP_HUNT_MODE_KEY = 'nba_prop_hunt';
export const NBA_PROP_HUNT_LABEL = 'Prop Hunt';
export const NBA_PROP_HUNT_CHANNEL = 'nba-prop-hunt-pending';
export const NBA_PROP_HUNT_STORE_PREFIX = 'nbaPropHunt:baseline';
export const NBA_PROP_HUNT_RESULT_EVENT = 'nba_prop_hunt_result';
export const NBA_PROP_HUNT_BASELINE_EVENT = 'nba_prop_hunt_baseline';

export const NBA_PROP_HUNT_ALLOWED_RESOLVE_AT = [...SHARED_ALLOWED_RESOLVE_AT];
export const NBA_PROP_HUNT_DEFAULT_RESOLVE_AT = SHARED_DEFAULT_RESOLVE_AT;

export const NBA_PROP_HUNT_STAT_KEY_TO_CATEGORY = NBA_STAT_KEY_TO_CATEGORY;
export const NBA_PROP_HUNT_STAT_KEY_LABELS = NBA_STAT_KEY_LABELS;
export const NBA_PROP_HUNT_LINE_RANGE = NBA_DEFAULT_STAT_RANGE;
export { getNbaStatRange as getStatRange };
