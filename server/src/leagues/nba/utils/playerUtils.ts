export type PlayerRef = { id?: string | null; name?: string | null };

export function resolvePlayerKey(playerId?: string | null, playerName?: string | null): string | null {
  const id = playerId ? String(playerId).trim() : '';
  if (id) return id;
  const name = playerName ? String(playerName).trim() : '';
  if (name) return `name:${name}`;
  return null;
}
