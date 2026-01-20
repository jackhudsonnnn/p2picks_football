export const LEAGUES = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'U2Pick'] as const;

export type League = (typeof LEAGUES)[number];

export function normalizeLeague(value: string | null | undefined, fallback: League = 'NFL'): League {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toUpperCase();
  const match = LEAGUES.find((league) => league.toUpperCase() === normalized);
  return (match ?? fallback) as League;
}
