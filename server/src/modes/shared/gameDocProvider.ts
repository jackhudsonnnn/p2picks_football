import { getCachedGameDoc } from '../../services/gameFeedService';
import { loadRefinedGame, type RefinedGameDoc } from '../../utils/gameData';

export async function ensureRefinedGameDoc(gameId: string, prefetched?: RefinedGameDoc | null): Promise<RefinedGameDoc | null> {
  if (prefetched) return prefetched;
  const cached = getCachedGameDoc(gameId);
  if (cached) return cached;
  return loadRefinedGame(gameId);
}

export function normalizeStatus(raw: string | null | undefined): string {
  return raw ? String(raw).trim().toUpperCase() : '';
}
