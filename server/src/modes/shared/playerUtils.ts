export const VALID_PLAYER_POSITIONS = [
  'CB',
  'DE',
  'DT',
  'S',
  'FB',
  'LB',
  'QB',
  'RB',
  'WR',
  'TE',
] as const;

const VALID_POSITION_SET = new Set<string>(VALID_PLAYER_POSITIONS);

export type ValidPlayerPosition = (typeof VALID_PLAYER_POSITIONS)[number];

export type PlayerLike = {
  position?: string | null;
  name?: string | null;
};

export function normalizePlayerPosition(position?: string | null): string {
  return (position ?? '').trim().toUpperCase();
}

export function isValidPlayerPosition(position?: string | null): position is ValidPlayerPosition {
  const normalized = normalizePlayerPosition(position);
  return Boolean(normalized) && VALID_POSITION_SET.has(normalized);
}

export function filterPlayersByValidPosition<T extends PlayerLike>(players: readonly T[]): T[] {
  return players.filter((player) => isValidPlayerPosition(player.position));
}

export function sortPlayersByPositionAndName<T extends PlayerLike>(players: readonly T[]): T[] {
  const toComparable = (value: string | null | undefined) => (value ?? '').trim().toUpperCase();

  return [...players].sort((a, b) => {
    const posA = normalizePlayerPosition(a.position);
    const posB = normalizePlayerPosition(b.position);

    const hasValidA = VALID_POSITION_SET.has(posA);
    const hasValidB = VALID_POSITION_SET.has(posB);

    if (hasValidA && hasValidB) {
      const cmp = posA.localeCompare(posB);
      if (cmp !== 0) return cmp;
    } else if (hasValidA !== hasValidB) {
      return hasValidA ? -1 : 1;
    } else if (posA || posB) {
      const cmp = posA.localeCompare(posB);
      if (cmp !== 0) return cmp;
    }

    const nameA = toComparable(a.name);
    const nameB = toComparable(b.name);
    if (nameA && nameB) return nameA.localeCompare(nameB);
    if (nameA) return -1;
    if (nameB) return 1;
    return 0;
  });
}

export function prepareValidPlayers<T extends PlayerLike>(players: readonly T[]): T[] {
  const filtered = filterPlayersByValidPosition(players);
  return sortPlayersByPositionAndName(filtered);
}
