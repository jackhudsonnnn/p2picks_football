import type { BetProposal } from '../../../supabaseClient';
import { loadRefinedGame, findPlayer, type RefinedGameDoc } from '../../../helpers';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT, STAT_KEY_TO_CATEGORY } from './constants';

export async function prepareEitherOrConfig({
  bet,
  config,
}: {
  bet: BetProposal;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const cfg = { ...config } as Record<string, unknown> & {
    nfl_game_id?: string | null;
    player1_id?: string | null;
    player1_name?: string | null;
    player2_id?: string | null;
    player2_name?: string | null;
    stat?: string | null;
    stat_label?: string | null;
    resolve_at?: string | null;
    bet_id?: string | null;
  };

  if (!cfg.nfl_game_id) {
    cfg.nfl_game_id = bet.nfl_game_id ?? null;
  }

  if (!cfg.resolve_at || !EITHER_OR_ALLOWED_RESOLVE_AT.includes(String(cfg.resolve_at))) {
    cfg.resolve_at = EITHER_OR_DEFAULT_RESOLVE_AT;
  }

  const statKey = cfg.stat ? String(cfg.stat) : '';
  const category = STAT_KEY_TO_CATEGORY[statKey];
  const gameId = cfg.nfl_game_id ? String(cfg.nfl_game_id) : '';

  if (!statKey || !category || !gameId) {
    return normalizeConfigPayload(cfg);
  }

  try {
    const doc = await loadRefinedGame(gameId);
    if (!doc) {
      return normalizeConfigPayload(cfg);
    }

    const [baselinePlayer1, baselinePlayer2] = await Promise.all([
      getPlayerStatValue(doc, statKey, { id: cfg.player1_id, name: cfg.player1_name }),
      getPlayerStatValue(doc, statKey, { id: cfg.player2_id, name: cfg.player2_name }),
    ]);

    return {
      ...normalizeConfigPayload(cfg),
      bet_id: bet.bet_id,
      baseline_player1: baselinePlayer1,
      baseline_player2: baselinePlayer2,
      baseline_captured_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[modes] failed to capture baselines for either_or', {
      bet_id: bet.bet_id,
      gameId,
      statKey,
      error: (err as Error).message,
    });
    return {
      ...normalizeConfigPayload(cfg),
      bet_id: bet.bet_id,
    };
  }
}

type PlayerRef = { id?: string | null; name?: string | null };

function normalizeConfigPayload(config: Record<string, unknown>) {
  return {
    bet_id: config.bet_id ?? null,
    nfl_game_id: config.nfl_game_id ?? null,
    player1_id: config.player1_id ?? null,
    player1_name: config.player1_name ?? null,
    player2_id: config.player2_id ?? null,
    player2_name: config.player2_name ?? null,
    stat: config.stat ?? null,
    stat_label: config.stat_label ?? null,
    resolve_at: config.resolve_at ?? null,
  } as Record<string, unknown>;
}

async function getPlayerStatValue(doc: RefinedGameDoc, statKey: string, ref: PlayerRef): Promise<number | null> {
  const category = STAT_KEY_TO_CATEGORY[statKey];
  if (!category) return null;
  const player = lookupPlayer(doc, ref);
  if (!player) return null;
  const stats = ((player as any).stats || {}) as Record<string, Record<string, unknown>>;
  const categoryStats = stats ? (stats[category] as Record<string, unknown>) : undefined;
  if (!categoryStats) return null;
  const raw = categoryStats[statKey];
  return normalizeStatValue(raw);
}

function lookupPlayer(doc: RefinedGameDoc, ref: PlayerRef) {
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

export function buildEitherOrMetadata() {
  return {
    statKeyToCategory: STAT_KEY_TO_CATEGORY,
    allowedResolveAt: EITHER_OR_ALLOWED_RESOLVE_AT,
  } as Record<string, unknown>;
}
