/**
 * Shared stat constants.
 * Centralized to keep mode modules decoupled—if one mode is deleted,
 * the other modes and shared utilities remain unaffected.
 */

export const STAT_KEY_TO_CATEGORY: Record<string, string> = {
  passingYards: 'passing',
  passingTouchdowns: 'passing',
  rushingYards: 'rushing',
  rushingTouchdowns: 'rushing',
  receptions: 'receiving',
  receivingYards: 'receiving',
  receivingTouchdowns: 'receiving',
  totalTackles: 'defensive',
  sacks: 'defensive',
  passesDefended: 'defensive',
};

export const STAT_KEY_LABELS: Record<string, string> = {
  passingYards: 'Passing Yards',
  passingTouchdowns: 'Passing Touchdowns',
  rushingYards: 'Rushing Yards',
  rushingTouchdowns: 'Rushing Touchdowns',
  receptions: 'Receptions',
  receivingYards: 'Receiving Yards',
  receivingTouchdowns: 'Receiving Touchdowns',
  totalTackles: 'Total Tackles',
  sacks: 'Sacks',
  passesDefended: 'Passes Defended',
};

export const ALLOWED_RESOLVE_AT = ['Halftime', 'End of Game'] as const;
export const DEFAULT_RESOLVE_AT = 'End of Game';
