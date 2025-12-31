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

export const STAT_KEY_RANGES: Record<string, { min: number; max: number; step: number }> = {
  passingYards: { min: 0.5, max: 599.5, step: 1 },
  passingTouchdowns: { min: 0.5, max: 9.5, step: 1 },
  rushingYards: { min: 0.5, max: 399.5, step: 1 },
  rushingTouchdowns: { min: 0.5, max: 9.5, step: 1 },
  receptions: { min: 0.5, max: 49.5, step: 1 },
  receivingYards: { min: 0.5, max: 399.5, step: 1 },
  receivingTouchdowns: { min: 0.5, max: 9.5, step: 1 },
  totalTackles: { min: 0.5, max: 29.5, step: 1 },
  sacks: { min: 0.5, max: 9.5, step: 1 },
  passesDefended: { min: 0.5, max: 19.5, step: 1 },
};

export const DEFAULT_STAT_RANGE = { min: 0.5, max: 499.5, step: 1 };

export function getStatRange(statKey: string | null | undefined): { min: number; max: number; step: number } {
  if (!statKey) return DEFAULT_STAT_RANGE;
  return STAT_KEY_RANGES[statKey] || DEFAULT_STAT_RANGE;
}

export const ALLOWED_RESOLVE_AT = ['Halftime', 'End of Game'] as const;
export const DEFAULT_RESOLVE_AT = 'End of Game';
