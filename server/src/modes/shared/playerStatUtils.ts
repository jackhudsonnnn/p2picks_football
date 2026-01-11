import { normalizePlayerPosition } from './playerUtils';
import { normalizeNumber } from '../../utils/number';

export type PlayerRef = { id?: string | null; name?: string | null };

export function normalizeStatValue(raw: unknown): number {
  return normalizeNumber(raw, 0);
}

export function normalizeProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  return normalized === 'starting_now' ? 'starting_now' : 'cumulative';
}

export function filterPlayersByPosition<T>(players: readonly T[], positionAccessor: (player: T) => string | null | undefined, validPositions: readonly string[]): T[] {
  const valid = new Set(validPositions.map((pos) => pos.trim().toUpperCase()));
  return players.filter((player) => valid.has(normalizePlayerPosition(positionAccessor(player))));
}
