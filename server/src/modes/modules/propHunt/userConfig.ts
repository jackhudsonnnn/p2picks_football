import { loadRefinedGame, findPlayer, type RefinedGameDoc } from '../../../helpers';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import { PROP_HUNT_ALLOWED_RESOLVE_AT, PROP_HUNT_DEFAULT_RESOLVE_AT, PROP_HUNT_LINE_RANGE, STAT_KEY_LABELS, STAT_KEY_TO_CATEGORY } from './constants';

interface BuildInput {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}

type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position?: string | null;
};

const DEBUG = process.env.DEBUG_PROP_HUNT === '1' || process.env.DEBUG_PROP_HUNT === 'true';

export async function buildPropHuntUserConfig(input: BuildInput = {}): Promise<ModeUserConfigStep[]> {
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const { doc, players } = await loadGameContext(gameId);
  const currentStat = doc ? getCurrentStatValue(doc, input.existingConfig ?? {}) : null;
  const skipResolveStep = shouldSkipResolveStep(doc);

  if (DEBUG) {
    console.log('[propHunt][userConfig] building steps', {
      gameId,
      playerCount: players.length,
      skipResolveStep,
      status: doc?.status ?? null,
      period: doc?.period ?? null,
    });
  }

  const playerChoices: ModeUserConfigChoice[] = players.map((player) => ({
    value: player.id,
    label: formatPlayerLabel(player),
    patch: {
      player_id: player.id,
      player_name: player.name,
      player_team_name: player.team ?? null,
      player_team: player.team ?? null,
    },
  }));

  const statChoices: ModeUserConfigChoice[] = Object.keys(STAT_KEY_TO_CATEGORY)
    .sort()
    .map((statKey) => {
      const label = STAT_KEY_LABELS[statKey] ?? humanizeStatKey(statKey);
      return {
        value: statKey,
        label,
        patch: {
          stat: statKey,
          stat_label: label,
          ...(skipResolveStep ? { resolve_at: PROP_HUNT_DEFAULT_RESOLVE_AT } : {}),
        },
      } satisfies ModeUserConfigChoice;
    });

  const steps: ModeUserConfigStep[] = [
    ['Select Player', playerChoices],
    ['Select Stat', statChoices],
  ];

  if (!skipResolveStep) {
    const resolveChoices: ModeUserConfigChoice[] = PROP_HUNT_ALLOWED_RESOLVE_AT.map((value) => ({
      value,
      label: value,
      patch: { resolve_at: value },
    }));
    steps.push(['Resolve At', resolveChoices]);
  }

  steps.push(['Set Line', buildLineChoices(input.existingConfig ?? {}, currentStat)]);

  return steps;
}

async function loadGameContext(gameId: string): Promise<{ doc: RefinedGameDoc | null; players: PlayerRecord[] }> {
  if (!gameId) {
    return { doc: null, players: [] };
  }
  try {
    const doc = await loadRefinedGame(gameId);
    if (!doc || !Array.isArray(doc.teams)) {
      return { doc, players: [] };
    }

    const records: PlayerRecord[] = [];
    const seen = new Set<string>();

    for (const team of doc.teams as any[]) {
      if (!team) continue;
      const teamName = team.abbreviation || team.name || '';
      const roster = (team as any).players;
      if (!roster) continue;

      const pushPlayer = (player: any) => {
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

      if (Array.isArray(roster)) {
        roster.forEach(pushPlayer);
      } else if (typeof roster === 'object') {
        Object.values(roster).forEach(pushPlayer);
      }
    }

    return { doc, players: records.sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (err) {
    if (DEBUG) {
      console.warn('[propHunt][userConfig] failed to load game context', {
        gameId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { doc: null, players: [] };
  }
}

function shouldSkipResolveStep(doc: RefinedGameDoc | null): boolean {
  if (!doc) return false;
  const status = typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  if (status === 'STATUS_HALFTIME') return true;
  if (typeof doc.period === 'number' && doc.period >= 3) return true;
  return false;
}

function buildLineChoices(existingConfig: Record<string, unknown>, currentStat: number | null): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];
  const { min, max, step } = PROP_HUNT_LINE_RANGE;
  const minimum = currentStat != null ? currentStat + 0.5 : min;
  const start = Math.max(min, Math.ceil(minimum * 2) / 2);

  if (start > max) {
    return [
      {
        value: 'unavailable',
        label: 'No valid lines available',
        description: 'The selected stat already exceeds the maximum supported line (499.5).',
        disabled: true,
      },
    ];
  }

  for (let value = start; value <= max; value += step) {
    const numeric = Number(value.toFixed(1));
    const label = numeric.toFixed(1);
    choices.push({
      value: label,
      label: label,
      patch: {
        line: label,
        line_value: numeric,
        line_label: label,
      },
    });
  }

  const currentLine = extractLine(existingConfig);
  if (currentLine && !choices.find((choice) => choice.value === currentLine)) {
    choices.unshift({
      value: currentLine,
      label: currentLine,
      patch: {
        line: currentLine,
        line_value: Number.parseFloat(currentLine),
        line_label: currentLine,
      },
    });
  }

  return choices;
}

function extractLine(config: Record<string, unknown>): string | null {
  const line = typeof config.line === 'string' ? config.line.trim() : '';
  if (line) return line;
  const value = typeof config.line_value === 'number' && Number.isFinite(config.line_value)
    ? config.line_value
    : null;
  if (value == null) return null;
  return value.toFixed(1);
}

function formatPlayerLabel(player: PlayerRecord): string {
  const segments = [player.name];
  if (player.team) segments.push(player.team);
  if (player.position) segments.push(player.position);
  return segments.join(' • ');
}

function humanizeStatKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withSpaces) return key;
  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getCurrentStatValue(doc: RefinedGameDoc, config: Record<string, unknown>): number | null {
  const statKey = typeof config.stat === 'string' ? config.stat : '';
  if (!statKey || !STAT_KEY_TO_CATEGORY[statKey]) {
    return null;
  }
  const ref = {
    id: typeof config.player_id === 'string' ? config.player_id : null,
    name: typeof config.player_name === 'string' ? config.player_name : null,
  } as { id?: string | null; name?: string | null };
  return extractPlayerStat(doc, statKey, ref);
}

function extractPlayerStat(doc: RefinedGameDoc, statKey: string, ref: { id?: string | null; name?: string | null }): number | null {
  const category = STAT_KEY_TO_CATEGORY[statKey];
  if (!category) return null;
  const player = lookupPlayer(doc, ref);
  if (!player) return null;
  const stats = ((player as any).stats || {}) as Record<string, Record<string, unknown>>;
  const categoryStats = stats ? (stats[category] as Record<string, unknown>) : undefined;
  if (!categoryStats) return null;
  return normalizeStatValue(categoryStats[statKey]);
}

function lookupPlayer(doc: RefinedGameDoc, ref: { id?: string | null; name?: string | null }) {
  if (ref.id) {
    const byId = findPlayer(doc, String(ref.id));
    if (byId) return byId;
  }
  if (ref.name) {
    const byName = findPlayer(doc, `name:${ref.name}`);
    if (byName) return byName;
  }
  return null;
}

function normalizeStatValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const first = raw.split('/')[0];
    const num = Number(first);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}
