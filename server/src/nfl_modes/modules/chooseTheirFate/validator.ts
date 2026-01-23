import { BetProposal } from '../../../supabaseClient';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/utils';
import { normalizeTeamId } from '../../shared/teamUtils';
import {
  getAllTeams,
  getGameStatus,
  getPossessionTeamId,
  getPossessionTeamName,
} from '../../../services/nflData/nflRefinedDataAccessors';
import {
  ChooseFateBaseline,
  ChooseTheirFateConfig,
  collectTeamScores,
  buildTeamScoresFromTeams,
  determineChooseFateOutcome,
} from './evaluator';
import {
  CHOOSE_THEIR_FATE_BASELINE_EVENT,
  CHOOSE_THEIR_FATE_CHANNEL,
  CHOOSE_THEIR_FATE_LABEL,
  CHOOSE_THEIR_FATE_MODE_KEY,
  CHOOSE_THEIR_FATE_RESULT_EVENT,
  CHOOSE_THEIR_FATE_STORE_PREFIX,
  CHOOSE_THEIR_FATE_STORE_TTL_SECONDS,
} from './constants';

export class ChooseTheirFateValidatorService extends BaseValidatorService<ChooseTheirFateConfig, ChooseFateBaseline> {
  constructor() {
    super({
      modeKey: CHOOSE_THEIR_FATE_MODE_KEY,
      channelName: CHOOSE_THEIR_FATE_CHANNEL,
      storeKeyPrefix: CHOOSE_THEIR_FATE_STORE_PREFIX,
      modeLabel: CHOOSE_THEIR_FATE_LABEL,
      resultEvent: CHOOSE_THEIR_FATE_RESULT_EVENT,
      baselineEvent: CHOOSE_THEIR_FATE_BASELINE_EVENT,
      storeTtlSeconds: CHOOSE_THEIR_FATE_STORE_TTL_SECONDS,
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.captureBaselineForBet(bet);
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.evaluateBet(bet, gameId);
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

  private async evaluateBet(bet: BetProposal, game_id: string): Promise<void> {
    try {
      const status = await getGameStatus(game_id);
      if (this.shouldAutoWashForStatus(status)) {
        await this.washBet(
          bet.bet_id,
          { reason: 'game_status', status: status },
          this.describeStatusWash(status),
        );
        return;
      }

      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        this.logWarn('missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }

      const baseline =
        (await this.store.get(bet.bet_id)) ||
        (await this.captureBaselineForBet(bet));
      if (!baseline) {
        this.logWarn('baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }

  const currentScores = await collectTeamScores(game_id);
  const possessionTeam = await getPossessionTeamId(game_id);
      const outcome = determineChooseFateOutcome(baseline, currentScores, possessionTeam);
      if (!outcome) return;

      switch (outcome.outcome) {
        case 'Touchdown':
          await this.setResult(bet.bet_id, 'Touchdown', {
            outcome: 'Touchdown',
            scoring_team_id: outcome.scoringTeamId,
          });
          return;
        case 'Field Goal':
          await this.setResult(bet.bet_id, 'Field Goal', {
            outcome: 'Field Goal',
            scoring_team_id: outcome.scoringTeamId,
          });
          return;
        case 'Safety':
          await this.setResult(bet.bet_id, 'Safety', {
            outcome: 'Safety',
            scoring_team_id: outcome.scoringTeamId,
            forced_by_team_id: outcome.forcedByTeamId ?? null,
          });
          return;
        case 'Punt':
          await this.setResult(bet.bet_id, 'Punt', {
            outcome: 'Punt',
            from_team_id: outcome.fromTeamId,
            to_team_id: outcome.toTeamId,
          });
          return;
        case 'Turnover':
          await this.setResult(bet.bet_id, 'Turnover', {
            outcome: 'Turnover',
            from_team_id: outcome.fromTeamId,
            to_team_id: outcome.toTeamId,
          });
          return;
        default:
          return;
      }
    } catch (err) {
      this.logError('evaluate bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async setResult(
    betId: string,
    winningChoice: 'Touchdown' | 'Field Goal' | 'Safety' | 'Punt' | 'Turnover',
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.resolveWithWinner(betId, winningChoice, {
      eventType: this.config.resultEvent,
      payload: {
        ...payload,
        captured_at: new Date().toISOString(),
      },
    });
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; league_game_id?: string | null },
  ): Promise<ChooseFateBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }

  const gameId = config.league_game_id || bet.league_game_id;
    if (!gameId) {
      this.logWarn('missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }

    const status = normalizeStatus(await getGameStatus(gameId));
    if (this.shouldAutoWashForStatus(status)) {
      await this.washBet(
        bet.bet_id,
        { reason: 'game_status', status },
        this.describeStatusWash(status),
      );
      return null;
    }

    const configuredPossessionTeamId = normalizeTeamId(config.possession_team_id ?? null);
    const [currentPossessionTeamId, currentPossessionTeamName] = await Promise.all([
      getPossessionTeamId(gameId).then(normalizeTeamId),
      getPossessionTeamName(gameId),
    ]);
    if (!currentPossessionTeamId) {
      await this.washBet(
        bet.bet_id,
        { reason: 'missing_possession' },
        'Could not capture the drive because no team had possession.',
      );
      return null;
    }

    if (configuredPossessionTeamId && currentPossessionTeamId !== configuredPossessionTeamId) {
      await this.washBet(
        bet.bet_id,
        {
          reason: 'possession_changed_before_pending',
          previous_possession_team_id: configuredPossessionTeamId,
          current_possession_team_id: currentPossessionTeamId,
        },
        'Drive changed teams before betting closed.',
      );
      return null;
    }

    const teams = await getAllTeams(gameId);
    if (!teams.length) {
      this.logWarn('refined teams unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }

    const possessionTeamId = currentPossessionTeamId;
    const baseline: ChooseFateBaseline = {
      gameId,
      possessionTeamId,
      capturedAt: new Date().toISOString(),
      teams: buildTeamScoresFromTeams(teams),
    };

    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, this.config.baselineEvent, {
      event: 'baseline',
      captured_at: baseline.capturedAt,
      possession_team_id: baseline.possessionTeamId,
      possession_team_name: currentPossessionTeamName ?? null,
      teams: baseline.teams,
    });

    return baseline;
  }

  private describeStatusWash(status: string | null | undefined): string {
    const label = this.formatStatusLabel(status);
    if (label) {
      return `The half ended before the drive could finish (status: ${label}).`;
    }
    return 'The half ended before the drive could finish.';
  }

  private formatStatusLabel(status: string | null | undefined): string | null {
    if (status === null || status === undefined) return null;
    const raw = String(status).trim();
    if (!raw) return null;

    const withoutPrefix = raw.replace(/^STATUS_/i, '');
    const withSpaces = withoutPrefix.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!withSpaces) return null;

    return withSpaces
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private shouldAutoWashForStatus(status: string | null | undefined): boolean {
    if (!status) return false;

    const normalized = normalizeStatus(status);
    if (!normalized || normalized === 'STATUS_IN_PROGRESS' || normalized === 'STATUS_END_PERIOD') return false;

    if (
      normalized.startsWith('STATUS_HALFTIME') ||
      normalized.startsWith('STATUS_FINAL') ||
      normalized.includes('POSTPONED') ||
      normalized.includes('SUSPENDED')
    ) {
      return true;
    }

    return false;
  }
}

export const chooseTheirFateValidator = new ChooseTheirFateValidatorService();

// helper functions removed; collectTeamScores now uses accessors in evaluator
