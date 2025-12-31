import type { RefinedGameDoc } from '../../services/nflData/nflRefinedDataService';
import { normalizePlayerPosition } from './playerUtils';
import { normalizeNumber } from '../../utils/number';

export type PlayerRef = { id?: string | null; name?: string | null };

function iteratePlayers(doc: RefinedGameDoc): any[] {
  const roster: any[] = [];
  for (const team of doc.teams || []) {
    const players = (team as any)?.players;
    if (Array.isArray(players)) {
      roster.push(...players);
    } else if (players && typeof players === 'object') {
      roster.push(...Object.values(players as Record<string, unknown>));
    }
  }
  return roster;
}

export function lookupPlayer(doc: RefinedGameDoc, ref: PlayerRef) {
  const roster = iteratePlayers(doc);
  const normalizedId = ref.id ? ref.id.trim() : '';
  if (normalizedId) {
    const byId = roster.find((player) => String(player?.athlete?.id ?? player?.athleteId ?? player?.id ?? '').trim() === normalizedId);
    if (byId) return byId;
  }
  const normalizedName = ref.name ? ref.name.trim().toLowerCase() : '';
  if (normalizedName) {
    const byName = roster.find((player) => String(player?.athlete?.displayName ?? player?.displayName ?? player?.fullName ?? '').trim().toLowerCase() === normalizedName);
    if (byName) return byName;
  }
  return null;
}

export function normalizeStatValue(raw: unknown): number {
  return normalizeNumber(raw, 0);
}

export function getPlayerStatValue(doc: RefinedGameDoc, ref: PlayerRef, statAccessor: (player: any) => unknown): number {
  const player = lookupPlayer(doc, ref);
  if (!player) return 0;
  const value = statAccessor(player) ?? statAccessor(player?.stats ?? {});
  return normalizeStatValue(value);
}

export function normalizeProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  return normalized === 'starting_now' ? 'starting_now' : 'cumulative';
}

export function filterPlayersByPosition<T>(players: readonly T[], positionAccessor: (player: T) => string | null | undefined, validPositions: readonly string[]): T[] {
  const valid = new Set(validPositions.map((pos) => pos.trim().toUpperCase()));
  return players.filter((player) => valid.has(normalizePlayerPosition(positionAccessor(player))));
}
