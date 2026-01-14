import { BetProposal } from '../../../supabaseClient';
import { getPlayerStat, getGameStatus } from '../../../services/nflData/nflRefinedDataAccessors';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/utils';
import { PLAYER_STAT_MAP } from './constants';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../shared/statConstants';
import { evaluateEitherOr, EitherOrBaseline, EitherOrConfig } from './evaluator';

export class EitherOrValidatorService extends BaseValidatorService<EitherOrConfig, EitherOrBaseline> {
  constructor() {
    super({
      modeKey: 'either_or',
      channelName: 'either-or-pending',
      storeKeyPrefix: 'eitherOr:baseline',
      modeLabel: 'Either Or',
      resultEvent: 'either_or_result',
      baselineEvent: 'either_or_baseline',
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.captureBaselineForBet(bet);
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const status = normalizeStatus(await getGameStatus(gameId));
    const halftimeResolveAt =
      ALLOWED_RESOLVE_AT.find((value) => value.toLowerCase() === 'halftime') ?? 'Halftime';

    if (status === 'STATUS_HALFTIME') {
      await this.processFinalGame(gameId, halftimeResolveAt);
      return;
    }

    if (status === 'STATUS_FINAL') {
      await this.processFinalGame(gameId, halftimeResolveAt);
      await this.processFinalGame(gameId, DEFAULT_RESOLVE_AT);
    }
  }

  protected async onKernelReady(): Promise<void> {
    await this.syncPendingBaselines();
  }

  private async syncPendingBaselines(): Promise<void> {
    const pending = await this.listPendingBets();
    for (const bet of pending) {
      const baseline = await this.store.get(bet.bet_id);
      if (!baseline) {
        await this.captureBaselineForBet(bet);
      }
    }
  }

  private async processFinalGame(gameId: string, resolveAt: string): Promise<void> {
    try {
      const bets = await this.listPendingBets({ gameId });
      for (const bet of bets) {
        await this.resolveBet(bet.bet_id, resolveAt);
      }
    } catch (err) {
      this.logError('process final game error', { gameId, resolveAt }, err);
    }
  }

  private async resolveBet(betId: string, resolveAt: string): Promise<void> {
    try {
      const config = await this.getConfigForBet(betId);
      if (!config) {
        this.logWarn('missing config; skipping bet', { betId });
        return;
      }

      const configResolveAt = String(config.resolve_at ?? DEFAULT_RESOLVE_AT).trim().toLowerCase();
      if (configResolveAt !== resolveAt.trim().toLowerCase()) {
        return;
      }

      const progressMode = normalizeProgressMode(config.progress_mode);
      const baseline =
        (await this.store.get(betId)) ||
        (progressMode === 'starting_now'
          ? await this.captureBaselineForBet({ bet_id: betId, nfl_game_id: config.nfl_game_id })
          : null);
      if (progressMode === 'starting_now' && !baseline) {
        this.logWarn('missing baseline for Starting Now', { betId });
        return;
      }

  const evaluation = await evaluateEitherOr(config, progressMode, baseline ?? undefined);
      if (!evaluation) {
        this.logWarn('evaluation unavailable', { betId });
        return;
      }

      if (evaluation.outcome === 'tie') {
        await this.washBet(
          betId,
          {
            stat: evaluation.statKey,
            player1: {
              ...evaluation.player1.ref,
              baseline: evaluation.player1.baseline,
              final: evaluation.player1.final,
              delta: evaluation.player1.metric,
            },
            player2: {
              ...evaluation.player2.ref,
              baseline: evaluation.player2.baseline,
              final: evaluation.player2.final,
              delta: evaluation.player2.metric,
            },
            progress_mode: progressMode,
          },
          this.tieExplanation(config, evaluation.player1.ref.name, evaluation.player2.ref.name, evaluation.statKey),
        );
        return;
      }

      const winnerName =
        evaluation.outcome === 'player1'
          ? config.player1_name || evaluation.player1.ref.name || 'Player 1'
          : config.player2_name || evaluation.player2.ref.name || 'Player 2';

      await this.resolveWithWinner(betId, winnerName, {
        eventType: this.config.resultEvent,
        payload: {
          outcome: 'winner',
          winning_choice: winnerName,
          stat: evaluation.statKey,
          player1: {
            ...evaluation.player1.ref,
            baseline: evaluation.player1.baseline,
            final: evaluation.player1.final,
            delta: evaluation.player1.metric,
          },
          player2: {
            ...evaluation.player2.ref,
            baseline: evaluation.player2.baseline,
            final: evaluation.player2.final,
            delta: evaluation.player2.metric,
          },
          progress_mode: progressMode,
          captured_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logError('resolve bet error', { betId }, err);
    }
  }

  private tieExplanation(config: EitherOrConfig, player1Name?: string | null, player2Name?: string | null, statKey?: string | null): string {
    const p1 = player1Name || config.player1_name || 'Player 1';
    const p2 = player2Name || config.player2_name || 'Player 2';
    const statLabel = this.formatStatLabel(config, statKey || config.stat || '');
    return `${p1} and ${p2} finished tied in ${statLabel}.`;
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
  ): Promise<EitherOrBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('cannot capture baseline; missing config', { betId: bet.bet_id });
      return null;
    }

    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      this.logWarn('missing game id for baseline capture', { betId: bet.bet_id });
      return null;
    }

    const baseline = await buildEitherOrBaselineFromAccessors(gameId, config);
    if (!baseline) {
      this.logWarn('failed to build baseline; unsupported config', { betId: bet.bet_id });
      return null;
    }

    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, this.config.baselineEvent, {
      stat: baseline.statKey,
      captured_at: baseline.capturedAt,
      player1: baseline.player1,
      player2: baseline.player2,
    });
    return baseline;
  }

  private formatStatLabel(config: EitherOrConfig, statKey: string): string {
    const raw = String(config.stat_label || config.stat || statKey || '').trim();
    if (!raw) return 'the selected stat';

    const withSpaces = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!withSpaces) return 'the selected stat';

    return withSpaces
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

export const eitherOrValidator = new EitherOrValidatorService();

async function buildEitherOrBaselineFromAccessors(
  gameId: string,
  config: EitherOrConfig,
  capturedAt: string = new Date().toISOString(),
): Promise<EitherOrBaseline | null> {
  const statKey = resolveStatKey(config);
  if (!statKey) return null;

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
    capturedAt,
    gameId,
    player1: { ref: { id: config.player1_id, name: config.player1_name }, value: Number(player1Value) || 0 },
    player2: { ref: { id: config.player2_id, name: config.player2_name }, value: Number(player2Value) || 0 },
  };
}

function resolvePlayerKey(id?: string | null, name?: string | null): string | null {
  const trimmedId = (id ?? '').trim();
  if (trimmedId) return trimmedId;
  const trimmedName = (name ?? '').trim();
  if (trimmedName) return `name:${trimmedName}`;
  return null;
}

function resolveStatKey(config: EitherOrConfig | null | undefined): string | null {
  const statKey = (config?.stat || '').trim();
  if (!statKey || !PLAYER_STAT_MAP[statKey]) return null;
  return statKey;
}

function normalizeProgressMode(mode?: string | null): 'starting_now' | 'cumulative' {
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  return normalized === 'starting_now' ? 'starting_now' : 'cumulative';
}
