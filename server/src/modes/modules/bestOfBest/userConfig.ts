import { loadRefinedGame } from '../../../helpers';
import { BEST_OF_BEST_ALLOWED_RESOLVE_AFTER, STAT_KEY_TO_CATEGORY } from './constants';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';

type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position?: string | null;
};

export async function buildBestOfBestUserConfig(input: {
  nflGameId?: string | null;
}): Promise<ModeUserConfigStep[]> {
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const players = await loadPlayerRecords(gameId);

  const playerMap = playersById(players);
  const basePlayerChoices = players.map((player) => ({
    value: player.id,
    label: formatPlayerLabel(player),
  }));

  const player1Choices: ModeUserConfigChoice[] = basePlayerChoices.map((choice) => ({
    ...choice,
    patch: {
      player1_id: choice.value,
      player1_name: playerMap[choice.value]?.name ?? choice.label,
    },
  }));

  const player2Choices: ModeUserConfigChoice[] = basePlayerChoices.map((choice) => ({
    ...choice,
    patch: {
      player2_id: choice.value,
      player2_name: playerMap[choice.value]?.name ?? choice.label,
    },
  }));

  const statChoices: ModeUserConfigChoice[] = Object.keys(STAT_KEY_TO_CATEGORY)
    .sort()
    .map((statKey) => {
      const label = humanizeStatKey(statKey);
      return {
        value: statKey,
        label,
        patch: {
          stat: statKey,
          stat_label: label,
        },
      } satisfies ModeUserConfigChoice;
    });

  const resolveChoices: ModeUserConfigChoice[] = BEST_OF_BEST_ALLOWED_RESOLVE_AFTER.map((value) => ({
    value,
    label: value,
    patch: { resolve_after: value },
  }));

  return [
    ['Select Player 1', player1Choices],
    ['Select Player 2', player2Choices],
    ['Select Stat', statChoices],
    ['Resolve After', resolveChoices],
  ];
}

async function loadPlayerRecords(gameId: string): Promise<PlayerRecord[]> {
  if (!gameId) return [];
  try {
    const doc = await loadRefinedGame(gameId);
    if (!doc || !Array.isArray(doc.teams)) return [];

    const records: PlayerRecord[] = [];
    const seen = new Set<string>();

    for (const team of doc.teams as any[]) {
      if (!team) continue;
      const teamName = team.abbreviation || team.displayName || '';
      const rawPlayers = (team as any).players;
      if (!rawPlayers) continue;

      const pushRecord = (player: any) => {
        if (!player) return;
        const id: string | undefined = player.athleteId || player.id || undefined;
        if (!id) return;
        if (seen.has(id)) return;
        seen.add(id);
        records.push({
          id: String(id),
          name: String(player.fullName || player.name || id),
          team: String(teamName || ''),
          position: player.position || player.pos || null,
        });
      };

      if (Array.isArray(rawPlayers)) {
        rawPlayers.forEach(pushRecord);
      } else if (typeof rawPlayers === 'object') {
        Object.values(rawPlayers).forEach(pushRecord);
      }
    }

    return records.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.warn('[bestOfBest] failed to load player records', { gameId, error: (err as Error).message });
    return [];
  }
}

function playersById(players: PlayerRecord[]): Record<string, PlayerRecord> {
  return players.reduce<Record<string, PlayerRecord>>((map, player) => {
    map[player.id] = player;
    return map;
  }, {});
}

function formatPlayerLabel(player: PlayerRecord): string {
  const pieces = [player.name];
  if (player.team) pieces.push(player.team);
  if (player.position) pieces.push(player.position);
  return pieces.join(' • ');
}

function humanizeStatKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
  if (!withSpaces) return key;
  return withSpaces
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
