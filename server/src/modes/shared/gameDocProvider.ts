import { getCachedGameDoc } from '../../services/nflData/gameFeedService';
import { getGameDoc, type RefinedGameDoc } from '../../services/nflData/nflRefinedDataService';

export async function ensureRefinedGameDoc(gameId: string, prefetched?: RefinedGameDoc | null): Promise<RefinedGameDoc | null> {
  if (prefetched) return prefetched;
  const cached = getCachedGameDoc(gameId);
  if (cached) return cached;
  return getGameDoc(gameId);
}

export function normalizeStatus(raw: string | null | undefined): string {
  return raw ? String(raw).trim().toUpperCase() : '';
}
