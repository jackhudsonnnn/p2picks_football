import { getPlayerStat } from '../../../services/leagueData';
import type { League } from '../../../types/league';
import type { PlayerRef } from './playerUtils';

export type PlayerStatSpec = { category: string; field: string };
export type PlayerStatMap = Record<string, PlayerStatSpec>;

export function resolvePlayerKey(playerId?: string | null, playerName?: string | null): string | null {
  const id = playerId ? String(playerId).trim() : '';
  if (id) return id;
  const name = playerName ? String(playerName).trim() : '';
  if (name) return `name:${name}`;
  return null;
}

export function resolveStatKey(stat?: string | null, statMap?: PlayerStatMap): string | null {
  const statKey = (stat || '').trim();
  if (!statKey) return null;
  if (statMap && !statMap[statKey]) return null;
  return statKey;
}

export async function readPlayerStatValue(
  league: League,
  gameId: string | null | undefined,
  ref: PlayerRef,
  statKey: string,
  statMap: PlayerStatMap,
): Promise<number | null> {
  const key = resolvePlayerKey(ref.id, ref.name);
  if (!gameId || !key) return null;
  const spec = statMap[statKey];
  if (!spec) return null;

  const value = await getPlayerStat(league, String(gameId), key, spec.category, spec.field);
  return Number.isFinite(value) ? Number(value) : null;
}
