import { BetProposal } from '../../../supabaseClient';
import { getGameStatus, getPlayerStat } from '../../../services/nflData/nflRefinedDataAccessors';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/utils';
import { clampResolveValue, KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE } from './constants';
import {
  KingOfTheHillConfig,
  ProgressRecord,
  applyProgressUpdate,
  determineProgressOutcome,
  readPlayerStat,
  resolveStatKey,
  type PlayerProgress,
} from './evaluator';

export class KingOfTheHillValidatorService extends BaseValidatorService<KingOfTheHillConfig, ProgressRecord> {
  private readonly initializingBets = new Set<string>();

  constructor() {
    super({
      modeKey: 'king_of_the_hill',
      channelName: 'king-of-the-hill-pending',
      storeKeyPrefix: 'kingOfTheHill:progress',
      modeLabel: 'King Of The Hill',
      resultEvent: 'king_of_the_hill_result',
      baselineEvent: 'king_of_the_hill_snapshot',
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.initializeProgressForBet(bet);
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      if (this.initializingBets.has(bet.bet_id)) {
        continue;
      }
      await this.evaluateBet(bet.bet_id, gameId);
    }
  }

  protected async onKernelReady(): Promise<void> {
    await this.syncPendingProgress();
  }

  private async syncPendingProgress(): Promise<void> {
    const pending = await this.listPendingBets();
    for (const bet of pending) {
      const progress = await this.store.get(bet.bet_id);
      if (!progress) {
        await this.initializeProgressForBet(bet);
      }
    }
  }

  private async evaluateBet(betId: string, gameId: string, updatedAt?: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        this.logWarn('missing config; skipping bet', { betId });
        return;
      }

      const threshold = this.normalizeResolveValue(config);
      if (threshold == null) {
        await this.washBet(betId, { reason: 'invalid_threshold', config }, 'Invalid resolve value configuration.');
        return;
      }

      const progress =
        (await this.store.get(betId)) ||
        (await this.initializeProgressForBet({ bet_id: betId, nfl_game_id: config.nfl_game_id }, updatedAt));
      if (!progress) {
        this.logWarn('progress unavailable; skipping bet', { betId });
        return;
      }

      const progressMode = progress.progressMode || normalizeProgressMode(config.progress_mode);
      const effectiveGameId = progress.gameId || (config.nfl_game_id ? String(config.nfl_game_id) : gameId);
      const player1Current = await readPlayerStat(effectiveGameId, { id: config.player1_id, name: config.player1_name }, progress.statKey);
      const player2Current = await readPlayerStat(effectiveGameId, { id: config.player2_id, name: config.player2_name }, progress.statKey);
      const timestamp = this.normalizeTimestamp(updatedAt);

      const updatedProgress = applyProgressUpdate(
        progress,
        progressMode,
        threshold,
        player1Current,
        player2Current,
        timestamp,
      );

      await this.store.set(betId, updatedProgress);
      const outcome = determineProgressOutcome(updatedProgress);
      if (outcome === 'player1') {
        await this.setWinner(betId, config.player1_name || updatedProgress.player1.name || 'Player 1', updatedProgress);
        return;
      }
      if (outcome === 'player2') {
        await this.setWinner(betId, config.player2_name || updatedProgress.player2.name || 'Player 2', updatedProgress);
        return;
      }
      if (outcome === 'tie') {
        await this.washBet(
          betId,
          {
            reason: 'simultaneous_finish',
            threshold: updatedProgress.threshold,
            player1: updatedProgress.player1,
            player2: updatedProgress.player2,
            stat_key: updatedProgress.statKey,
            progress_mode: updatedProgress.progressMode,
          },
          'Both players reached the resolve value at the same time.',
        );
        return;
      }

      const status = normalizeStatus(await getGameStatus(effectiveGameId));
      if (status === 'STATUS_FINAL' && outcome === 'none') {
        await this.setNeitherResult(betId, updatedProgress);
      }
    } catch (err) {
      this.logError('evaluate bet error', { betId }, err);
    }
  }

  private async initializeProgressForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    eventTimestamp?: string,
  ): Promise<ProgressRecord | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    this.initializingBets.add(bet.bet_id);
    const config = await this.getConfigForBet(bet.bet_id);
    try {
      if (!config) {
        this.logWarn('cannot initialize progress; missing config', { betId: bet.bet_id });
        return null;
      }

      const statKey = resolveStatKey(config);
      if (!statKey) {
        this.logWarn('unsupported stat key', { betId: bet.bet_id, stat: config.stat });
        return null;
      }

      const progressMode = normalizeProgressMode(config.progress_mode);
      const threshold = this.normalizeResolveValue(config);
      if (threshold == null) {
        this.logWarn('invalid resolve value', { betId: bet.bet_id });
        return null;
      }

      const gameId = config.nfl_game_id || bet.nfl_game_id;
      if (!gameId) {
        this.logWarn('missing game id for progress capture', { betId: bet.bet_id });
        return null;
      }

      const capturedAt = this.normalizeTimestamp(eventTimestamp);
      const progress = await buildProgressRecordFromAccessors(
        gameId,
        config,
        statKey,
        threshold,
        progressMode,
        capturedAt,
      );
      if (!progress) {
        this.logWarn('unable to build progress from accessors', { betId: bet.bet_id, gameId });
        return null;
      }
      const player1Value = progress.player1.lastValue;
      const player2Value = progress.player2.lastValue;

      if (progressMode === 'cumulative' && (player1Value >= threshold || player2Value >= threshold)) {
        await this.washBet(
          bet.bet_id,
          {
            reason: 'threshold_met_before_pending',
            threshold,
            player1_value: player1Value,
            player2_value: player2Value,
            progress_mode: progressMode,
          },
          'Resolve value was already met before the bet became pending.',
        );
        return null;
      }

      await this.store.set(bet.bet_id, progress);
      await this.recordHistory(bet.bet_id, this.config.baselineEvent, progress as unknown as Record<string, unknown>);
      return progress;
    } finally {
      this.initializingBets.delete(bet.bet_id);
    }
  }

  private async setWinner(betId: string, winningChoice: string, progress: ProgressRecord): Promise<void> {
    await this.resolveWithWinner(betId, winningChoice, {
      eventType: this.config.resultEvent,
      payload: {
        outcome: winningChoice,
        threshold: progress.threshold,
        player1: progress.player1,
        player2: progress.player2,
        stat_key: progress.statKey,
        progress_mode: progress.progressMode,
        captured_at: new Date().toISOString(),
      },
    });
  }

  private async setNeitherResult(betId: string, progress: ProgressRecord): Promise<void> {
    await this.resolveWithWinner(betId, 'Neither', {
      eventType: this.config.resultEvent,
      payload: {
        outcome: 'Neither',
        threshold: progress.threshold,
        player1: progress.player1,
        player2: progress.player2,
        stat_key: progress.statKey,
        progress_mode: progress.progressMode,
        captured_at: new Date().toISOString(),
      },
    });
  }

  private normalizeResolveValue(config: KingOfTheHillConfig): number | null {
    if (typeof config.resolve_value === 'number' && Number.isFinite(config.resolve_value)) {
      return clampResolveValue(config.resolve_value);
    }

    if (typeof config.resolve_value_label === 'string' && config.resolve_value_label.trim().length) {
      const parsed = Number.parseInt(config.resolve_value_label, 10);
      if (Number.isFinite(parsed)) {
        return clampResolveValue(parsed);
      }
    }

    return clampResolveValue(KING_OF_THE_HILL_DEFAULT_RESOLVE_VALUE);
  }

  private describePlayer(
    progress: PlayerProgress,
    latestValue: number,
    progressMode: 'starting_now' | 'cumulative',
  ): Record<string, unknown> {
    const baseline = Number.isFinite(progress.baselineValue) ? progress.baselineValue : 0;
    const delta = Math.max(0, latestValue - baseline);
    const metric = progressMode === 'starting_now' ? delta : latestValue;
    return {
      id: progress.id ?? null,
      name: progress.name ?? null,
      baseline,
      latestValue,
      delta,
      metric,
      reached: progress.reached,
      reachedAt: progress.reachedAt,
    };
  }
}

export const kingOfTheHillValidator = new KingOfTheHillValidatorService();

async function buildProgressRecordFromAccessors(
  gameId: string,
  config: KingOfTheHillConfig,
  statKey: string,
  threshold: number,
  progressMode: 'starting_now' | 'cumulative',
  capturedAt: string,
): Promise<ProgressRecord | null> {
  const spec = PLAYER_STAT_MAP[statKey];
  if (!spec) return null;

  const player1Key = resolvePlayerKey(config.player1_id, config.player1_name);
  const player2Key = resolvePlayerKey(config.player2_id, config.player2_name);
  if (!player1Key || !player2Key) return null;

  const [player1Value, player2Value] = await Promise.all([
    getPlayerStat(gameId, player1Key, spec.category, spec.field),
    getPlayerStat(gameId, player2Key, spec.category, spec.field),
  ]);

  return {
    statKey,
    threshold,
    gameId,
    capturedAt,
    progressMode,
    player1: createPlayerProgressLocal(config.player1_id, config.player1_name, Number(player1Value) || 0),
    player2: createPlayerProgressLocal(config.player2_id, config.player2_name, Number(player2Value) || 0),
  };
}

function createPlayerProgressLocal(id?: string | null, name?: string | null, baselineValue = 0): PlayerProgress {
  return {
    id,
    name,
    baselineValue,
    lastValue: baselineValue,
    reached: false,
    reachedAt: null,
    valueAtReach: null,
    deltaAtReach: null,
    metricAtReach: null,
  };
}

function normalizeProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  return normalized === 'starting_now' ? 'starting_now' : 'cumulative';
}

function resolvePlayerKey(id?: string | null, name?: string | null): string | null {
  const trimmedId = (id ?? '').trim();
  if (trimmedId) return trimmedId;
  const trimmedName = (name ?? '').trim();
  if (trimmedName) return `name:${trimmedName}`;
  return null;
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
  interceptions: { category: 'interceptions', field: 'interceptions' },
  kickReturnYards: { category: 'kickReturns', field: 'kickReturnYards' },
  longKickReturn: { category: 'kickReturns', field: 'longKickReturn' },
  puntReturnYards: { category: 'puntReturns', field: 'puntReturnYards' },
  longPuntReturn: { category: 'puntReturns', field: 'longPuntReturn' },
  puntsInside20: { category: 'punting', field: 'puntsInside20' },
  longPunt: { category: 'punting', field: 'longPunt' },
};
