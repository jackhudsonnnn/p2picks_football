export const STAT_KEY_TO_CATEGORY: Record<string, string> = {
  passingYards: 'passing',
  passingTouchdowns: 'passing',
  rushingYards: 'rushing',
  rushingTouchdowns: 'rushing',
  longRushing: 'rushing',
  receptions: 'receiving',
  receivingYards: 'receiving',
  receivingTouchdowns: 'receiving',
  longReception: 'receiving',
  totalTackles: 'defensive',
  sacks: 'defensive',
  passesDefended: 'defensive'
};

export const EITHER_OR_ALLOWED_RESOLVE_AT = ['Halftime', 'End of Game'];
export const EITHER_OR_DEFAULT_RESOLVE_AT = 'End of Game';

export const STAT_KEY_LABELS: Record<string, string> = {
  passingYards: 'Passing Yards',
  passingTouchdowns: 'Passing Touchdowns',
  rushingYards: 'Rushing Yards',
  rushingTouchdowns: 'Rushing Touchdowns',
  longRushing: 'Longest Rush',
  receptions: 'Receptions',
  receivingYards: 'Receiving Yards',
  receivingTouchdowns: 'Receiving Touchdowns',
  longReception: 'Longest Reception',
  totalTackles: 'Total Tackles',
  sacks: 'Sacks',
  passesDefended: 'Passes Defended',
};
