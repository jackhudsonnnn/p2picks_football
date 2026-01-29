export const EITHER_OR_MODE_KEY = 'nfl_either_or';
export const EITHER_OR_LABEL = 'Either Or';
export const EITHER_OR_CHANNEL = 'nfl_either-or-pending';
export const EITHER_OR_STORE_PREFIX = 'nfl_eitherOr:baseline';
export const EITHER_OR_RESULT_EVENT = 'nfl_either_or_result';
export const EITHER_OR_BASELINE_EVENT = 'nfl_either_or_baseline';

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
