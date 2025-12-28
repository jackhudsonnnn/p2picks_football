import { STAT_KEY_TO_CATEGORY } from './statConstants';

export const POSITIONS_BY_CATEGORY: Record<string, string[]> = {
  passing: ['QB'],
  rushing: ['QB', 'RB', 'FB', 'WR', 'TE'],
  receiving: ['WR', 'TE', 'RB', 'FB'],
  defensive: ['DT', 'DE', 'LB', 'CB', 'S'],
};

export function getValidPositionsForStat(statKey: string | null | undefined): string[] | null {
  if (!statKey) return null;
  const category = STAT_KEY_TO_CATEGORY[statKey];
  if (!category) return null;
  return POSITIONS_BY_CATEGORY[category] || null;
}
