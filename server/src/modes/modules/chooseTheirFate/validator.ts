import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { RefinedGameDoc } from '../../../utils/gameData';
import { ModeRuntimeKernel } from '../../shared/modeRuntimeKernel';
import { betRepository } from '../../shared/betRepository';
import { washBetWithHistory } from '../../shared/washService';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { ensureRefinedGameDoc, normalizeStatus } from '../../shared/gameDocProvider';
import { normalizeTeamId } from '../../shared/teamUtils';
import {
  ChooseFateBaseline,
  ChooseTheirFateConfig,
  collectTeamScores,
  determineChooseFateOutcome,
  possessionTeamIdFromDoc,
} from './evaluator';

export class ChooseTheirFateValidatorService {
  private readonly baselineStore: RedisJsonStore<ChooseFateBaseline>;
  private readonly kernel: ModeRuntimeKernel;
  private readonly modeLabel = 'Choose Their Fate';
  private readonly baselineEvent = 'choose_their_fate_baseline';
  private readonly resultEvent = 'choose_their_fate_result';

  constructor() {
    const redis = getRedisClient();
    this.baselineStore = new RedisJsonStore(redis, 'choosefate:baseline', 60 * 60 * 6);
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'choose_their_fate',
      channelName: 'choose-their-fate-pending',
      dedupeGameFeed: true,
      onPendingUpdate: (payload) => this.handleBetProposalUpdate(payload),
      onPendingDelete: (payload) => this.handleBetProposalDelete(payload),
      onGameEvent: (event) => this.processGameUpdate(event.gameId, event.doc),
      onReady: () => this.syncPendingBaselines(),
    });
  }

  start(): void {
    this.kernel.start();
  }

  stop(): void {
    this.kernel.stop();
  }

  private async handleBetProposalUpdate(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const next = (payload.new || {}) as Partial<BetProposal>;
      const previous = (payload.old || {}) as Partial<BetProposal>;
      if (!next.bet_id) return;
      if (next.bet_status === 'pending' && previous.bet_status !== 'pending') {
        await this.captureBaselineForBet(next as BetProposal);
      }
      const exitPending = next.bet_status !== 'pending' && previous.bet_status === 'pending';
      if (exitPending || (next.winning_choice && !previous.winning_choice)) {
        await this.baselineStore.delete(next.bet_id);
      }
    } catch (err) {
      console.error('[chooseTheirFate] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const previous = (payload.old || {}) as Partial<BetProposal>;
      if (previous.bet_id) {
        await this.baselineStore.delete(previous.bet_id);
      }
    } catch (err) {
      console.error('[chooseTheirFate] pending delete handler error', err);
    }
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const pending = await betRepository.listPendingBets('choose_their_fate');
      for (const bet of pending) {
        const baseline = await this.baselineStore.get(bet.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(bet);
        }
      }
    } catch (err) {
      console.error('[chooseTheirFate] sync pending baselines failed', err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const bets = await betRepository.listPendingBets('choose_their_fate', { gameId });
      for (const bet of bets) {
        await this.evaluateBet(bet, doc);
      }
    } catch (err) {
      console.error('[chooseTheirFate] process game update error', { gameId }, err);
    }
  }

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc): Promise<void> {
    try {
      const status = normalizeStatus(doc.status);
      if (this.shouldAutoWashForStatus(status)) {
        await this.washBet(bet.bet_id, { reason: 'game_status', status: doc.status ?? null }, this.describeStatusWash(doc.status));
        return;
      }
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[chooseTheirFate] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const baseline = (await this.baselineStore.get(bet.bet_id)) || (await this.captureBaselineForBet(bet, doc));
      if (!baseline) {
        console.warn('[chooseTheirFate] baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const currentScores = collectTeamScores(doc);
      const possessionTeam = possessionTeamIdFromDoc(doc);
      const outcome = determineChooseFateOutcome(baseline, currentScores, possessionTeam);
      if (!outcome) return;
      if (outcome.outcome === 'Touchdown') {
        await this.setResult(bet.bet_id, 'Touchdown', {
          outcome: 'Touchdown',
          scoring_team_id: outcome.scoringTeamId,
        });
        return;
      }
      if (outcome.outcome === 'Field Goal') {
        await this.setResult(bet.bet_id, 'Field Goal', {
          outcome: 'Field Goal',
          scoring_team_id: outcome.scoringTeamId,
        });
        return;
      }
      if (outcome.outcome === 'Safety') {
        await this.setResult(bet.bet_id, 'Safety', {
          outcome: 'Safety',
          scoring_team_id: outcome.scoringTeamId,
          forced_by_team_id: outcome.forcedByTeamId ?? null,
        });
        return;
      }
      if (outcome.outcome === 'Punt') {
        await this.setResult(bet.bet_id, 'Punt', {
          outcome: 'Punt',
          from_team_id: outcome.fromTeamId,
          to_team_id: outcome.toTeamId,
        });
        return;
      }
      if (outcome.outcome === 'Turnover') {
        await this.setResult(bet.bet_id, 'Turnover', {
          outcome: 'Turnover',
          from_team_id: outcome.fromTeamId,
          to_team_id: outcome.toTeamId,
        });
      }
    } catch (err) {
      console.error('[chooseTheirFate] evaluate bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async setResult(
    betId: string,
    winningChoice: 'Touchdown' | 'Field Goal' | 'Safety' | 'Punt' | 'Turnover',
    payload: Record<string, unknown>,
  ): Promise<void> {
    const updated = await betRepository.setWinningChoice(betId, winningChoice);
    if (!updated) return;
    await betRepository.recordHistory(betId, this.resultEvent, {
      ...payload,
      captured_at: new Date().toISOString(),
    });
    await this.baselineStore.delete(betId);
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
  ): Promise<ChooseFateBaseline | null> {
    const existing = await this.baselineStore.get(bet.bet_id);
    if (existing) return existing;
    const config = await this.getConfigForBet(bet.bet_id);
    if (!config) {
      console.warn('[chooseTheirFate] cannot capture baseline; missing config', { bet_id: bet.bet_id });
      return null;
    }
    const gameId = config.nfl_game_id || bet.nfl_game_id;
    if (!gameId) {
      console.warn('[chooseTheirFate] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    const doc = await ensureRefinedGameDoc(gameId, prefetchedDoc ?? null);
    if (!doc) {
      console.warn('[chooseTheirFate] refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const status = normalizeStatus(doc.status);
    if (this.shouldAutoWashForStatus(status)) {
      await this.washBet(bet.bet_id, { reason: 'game_status', status: doc.status ?? null }, this.describeStatusWash(doc.status));
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
    await this.baselineStore.set(bet.bet_id, baseline);
    await betRepository.recordHistory(bet.bet_id, this.baselineEvent, {
      event: 'baseline',
      captured_at: baseline.capturedAt,
      possession_team_id: baseline.possessionTeamId,
      teams: baseline.teams,
    });
    return baseline;
  }

  private async getConfigForBet(betId: string): Promise<ChooseTheirFateConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'choose_their_fate') return null;
      return record.data as ChooseTheirFateConfig;
    } catch (err) {
      console.error('[chooseTheirFate] fetch config error', { betId }, err);
      return null;
    }
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

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    await washBetWithHistory({
      betId,
      payload,
      explanation,
      eventType: this.resultEvent,
      modeLabel: this.modeLabel,
    });
    await this.baselineStore.delete(betId);
  }
}

export const chooseTheirFateValidator = new ChooseTheirFateValidatorService();
