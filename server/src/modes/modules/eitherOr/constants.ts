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
  passesDefended: 'defensive',
  interceptions: 'interceptions',
  kickReturnYards: 'kickReturns',
  longKickReturn: 'kickReturns',
  puntReturnYards: 'puntReturns',
  longPuntReturn: 'puntReturns',
  puntsInside20: 'punting',
  longPunt: 'punting',
};

export const EITHER_OR_ALLOWED_RESOLVE_AT = ['Halftime', 'End of Game'];
export const EITHER_OR_DEFAULT_RESOLVE_AT = 'End of Game';
