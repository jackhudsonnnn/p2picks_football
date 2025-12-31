import { BetProposal } from '../../../supabaseClient';
import { RefinedGameDoc } from '../../../services/nflRefinedDataService';
import { BaseValidatorService } from '../../shared/baseValidatorService';
import { normalizeStatus } from '../../shared/gameDocProvider';
import { normalizeTeamId } from '../../shared/teamUtils';
import {
  ChooseFateBaseline,
  ChooseTheirFateConfig,
  collectTeamScores,
  determineChooseFateOutcome,
  possessionTeamIdFromDoc,
} from './evaluator';

export class ChooseTheirFateValidatorService extends BaseValidatorService<ChooseTheirFateConfig, ChooseFateBaseline> {
  constructor() {
    super({
      modeKey: 'choose_their_fate',
      channelName: 'choose-their-fate-pending',
      storeKeyPrefix: 'choosefate:baseline',
      modeLabel: 'Choose Their Fate',
      resultEvent: 'choose_their_fate_result',
      baselineEvent: 'choose_their_fate_baseline',
      storeTtlSeconds: 60 * 60 * 6,
    });
  }

  protected async onBetBecamePending(bet: BetProposal): Promise<void> {
    await this.captureBaselineForBet(bet);
  }

  protected async onGameUpdate(gameId: string, doc: RefinedGameDoc): Promise<void> {
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.evaluateBet(bet, doc);
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

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc): Promise<void> {
    try {
      const status = normalizeStatus(doc.status);
      if (this.shouldAutoWashForStatus(status)) {
        await this.washBet(
          bet.bet_id,
          { reason: 'game_status', status: doc.status ?? null },
          this.describeStatusWash(doc.status),
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
        (await this.captureBaselineForBet(bet, doc));
      if (!baseline) {
        this.logWarn('baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }

      const currentScores = collectTeamScores(doc);
      const possessionTeam = possessionTeamIdFromDoc(doc);
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
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
  ): Promise<ChooseFateBaseline | null> {
    const existing = await this.store.get(bet.bet_id);
    if (existing) return existing;

    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      this.logWarn('cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }

    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      this.logWarn('missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }

    const doc = await this.ensureGameDoc(gameId, prefetchedDoc ?? null);
    if (!doc) {
      this.logWarn('refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }

    const status = normalizeStatus(doc.status);
    if (this.shouldAutoWashForStatus(status)) {
      await this.washBet(
        bet.bet_id,
        { reason: 'game_status', status: doc.status ?? null },
        this.describeStatusWash(doc.status),
      );
      return null;
    }

    const configuredPossessionTeamId = normalizeTeamId(config.possession_team_id ?? null);
    const currentPossessionTeamId = normalizeTeamId(possessionTeamIdFromDoc(doc));
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

    const possessionTeamId = currentPossessionTeamId;
    const baseline: ChooseFateBaseline = {
      gameId,
      possessionTeamId,
      capturedAt: new Date().toISOString(),
      teams: collectTeamScores(doc),
    };

    await this.store.set(bet.bet_id, baseline);
    await this.recordHistory(bet.bet_id, this.config.baselineEvent, {
      event: 'baseline',
      captured_at: baseline.capturedAt,
      possession_team_id: baseline.possessionTeamId,
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
