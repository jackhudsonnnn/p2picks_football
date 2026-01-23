import { type PlayerRef } from '../../shared/playerUtils';
import { readPlayerStatValue, resolvePlayerKey, resolveStatKey as baseResolveStatKey } from '../../shared/statEvaluatorHelpers';
import type { League } from '../../../types/league';

export interface EitherOrConfig {
  player1_id?: string | null;
  player1_name?: string | null;
  player2_id?: string | null;
  player2_name?: string | null;
  stat?: string | null;
  stat_label?: string | null;
  league_game_id?: string | null;
  league?: League | null;
  resolve_at?: string | null;
  progress_mode?: string | null;
}

export interface EitherOrPlayerSnapshot {
  ref: PlayerRef;
  value: number;
}

export interface EitherOrBaseline {
  statKey: string;
  capturedAt: string;
  gameId: string;
  player1: EitherOrPlayerSnapshot;
  player2: EitherOrPlayerSnapshot;
}

export interface EitherOrPlayerEvaluation extends EitherOrPlayerSnapshot {
  final: number;
  baseline: number;
  metric: number;
}

export interface EitherOrEvaluationResult {
  statKey: string;
  player1: EitherOrPlayerEvaluation;
  player2: EitherOrPlayerEvaluation;
  outcome: 'player1' | 'player2' | 'tie';
}

const PLAYER_STAT_MAP: Record<string, { category: string; field: string }> = {
  passingYards: { category: 'passing', field: 'passingYards' },
  passingTouchdowns: { category: 'passing', field: 'passingTouchdowns' },
  rushingYards: { category: 'rushing', field: 'rushingYards' },
  rushingTouchdowns: { category: 'rushing', field: 'rushingTouchdowns' },
  longRushing: { category: 'rushing', field: 'longRushing' },
  receptions: { category: 'receiving', field: 'receptions' },
  receivingYards: { category: 'receiving', field: 'receivingYards' },
  receivingTouchdowns: { category: 'receiving', field: 'receivingTouchdowns' },
  longReception: { category: 'receiving', field: 'longReception' },
  totalTackles: { category: 'defensive', field: 'totalTackles' },
  sacks: { category: 'defensive', field: 'sacks' },
  passesDefended: { category: 'defensive', field: 'passesDefended' },
};

function resolveStatKey(config: EitherOrConfig | null | undefined): string | null {
  return baseResolveStatKey(config?.stat, PLAYER_STAT_MAP);
}

async function getPlayerValue(league: League, gameId: string, ref: PlayerRef, statKey: string): Promise<number> {
  const value = await readPlayerStatValue(league, gameId, ref, statKey, PLAYER_STAT_MAP);
  return value ?? 0;
}

export async function buildEitherOrBaseline(
  config: EitherOrConfig,
  gameId: string,
  capturedAt: string = new Date().toISOString(),
): Promise<EitherOrBaseline | null> {
  const statKey = resolveStatKey(config);
  if (!statKey) return null;
  const league = config.league ?? 'NFL';
  const player1Ref: PlayerRef = { id: config.player1_id, name: config.player1_name };
  const player2Ref: PlayerRef = { id: config.player2_id, name: config.player2_name };
  const [player1Value, player2Value] = await Promise.all([
    getPlayerValue(league, gameId, player1Ref, statKey),
    getPlayerValue(league, gameId, player2Ref, statKey),
  ]);
  return {
    statKey,
    capturedAt,
    gameId,
    player1: { ref: player1Ref, value: player1Value },
    player2: { ref: player2Ref, value: player2Value },
  };
}

export async function evaluateEitherOr(
  config: EitherOrConfig,
  progressMode: 'starting_now' | 'cumulative',
  baseline?: EitherOrBaseline | null,
): Promise<EitherOrEvaluationResult | null> {
  const statKey = baseline?.statKey ?? resolveStatKey(config);
  if (!statKey) return null;

  const gameId = baseline?.gameId || config.league_game_id;
  if (!gameId) return null;

  const league = config.league ?? 'NFL';
  const player1Ref: PlayerRef = {
    id: baseline?.player1.ref.id ?? config.player1_id,
    name: baseline?.player1.ref.name ?? config.player1_name,
  };
  const player2Ref: PlayerRef = {
    id: baseline?.player2.ref.id ?? config.player2_id,
    name: baseline?.player2.ref.name ?? config.player2_name,
  };

  const [player1Final, player2Final] = await Promise.all([
    getPlayerValue(league, gameId, player1Ref, statKey),
    getPlayerValue(league, gameId, player2Ref, statKey),
  ]);

  if (!Number.isFinite(player1Final) || !Number.isFinite(player2Final)) return null;
  if (progressMode === 'starting_now' && !baseline) return null;

  const baseline1 = baseline?.player1.value ?? 0;
  const baseline2 = baseline?.player2.value ?? 0;
  const metric1 = progressMode === 'starting_now' ? player1Final - baseline1 : player1Final;
  const metric2 = progressMode === 'starting_now' ? player2Final - baseline2 : player2Final;
  const outcome = metric1 === metric2 ? 'tie' : metric1 > metric2 ? 'player1' : 'player2';

  return {
    statKey,
    player1: {
      ref: player1Ref,
      value: baseline1,
      baseline: baseline1,
      final: player1Final,
      metric: metric1,
    },
    player2: {
      ref: player2Ref,
      value: baseline2,
      baseline: baseline2,
      final: player2Final,
      metric: metric2,
    },
    outcome,
  };
}
