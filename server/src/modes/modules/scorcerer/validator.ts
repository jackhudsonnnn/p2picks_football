import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { BetProposal } from '../../../supabaseClient';
import { getTeamScoreStats } from '../../../services/gameDataService';
import { RefinedGameDoc } from '../../../utils/gameData';
import { ModeRuntimeKernel } from '../../shared/modeRuntimeKernel';
import { betRepository } from '../../shared/betRepository';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { ensureRefinedGameDoc } from '../../shared/gameDocProvider';
import { normalizeNumber } from '../../shared/numberUtils';

interface AggregateTotals {
  touchdowns: number;
  fieldGoals: number;
  safeties: number;
  teamCount: number;
}

interface BaselineSnapshot {
  touchdowns: number;
  fieldGoals: number;
  safeties: number;
  capturedAt: string;
  gameId: string;
}

interface SnapshotCacheEntry {
  signatureHash: string;
  signatureJson?: string;
}

interface SnapshotState {
  shouldProcess: boolean;
  previousHash: string | null;
  totals: AggregateTotals;
}

export class ScorcererValidatorService {
  private readonly kernel: ModeRuntimeKernel;
  private readonly baselineStore: RedisJsonStore<BaselineSnapshot>;
  private readonly snapshotStore: RedisJsonStore<SnapshotCacheEntry>;
  private readonly storeRawSnapshots = process.env.SCORCERER_STORE_RAW === '1' || process.env.SCORCERER_STORE_RAW === 'true';
  private readonly resultEvent = 'scorcerer_result';
  private readonly baselineEvent = 'scorcerer_baseline';

  constructor() {
    const redis = getRedisClient();
    this.baselineStore = new RedisJsonStore(redis, 'scorcerer:baseline', 60 * 60 * 12);
    this.snapshotStore = new RedisJsonStore(redis, 'scorcerer:snapshot', 60 * 60 * 6);
    this.kernel = new ModeRuntimeKernel({
      modeKey: 'scorcerer',
      channelName: 'scorcerer-pending',
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
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (!next.bet_id) return;
      if (next.bet_status === 'pending' && prev.bet_status !== 'pending') {
        await this.captureBaselineForBet(next as BetProposal);
      }
      const exitedPending = next.bet_status !== 'pending' && prev.bet_status === 'pending';
      if (exitedPending || (next.winning_choice && !prev.winning_choice)) {
        await this.baselineStore.delete(next.bet_id);
      }
    } catch (err) {
      console.error('[scorcerer] pending update handler error', err);
    }
  }

  private async handleBetProposalDelete(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): Promise<void> {
    try {
      const prev = (payload.old || {}) as Partial<BetProposal>;
      if (prev.bet_id) {
        await this.baselineStore.delete(prev.bet_id);
      }
    } catch (err) {
      console.error('[scorcerer] pending delete handler error', err);
    }
  }

  private async syncPendingBaselines(): Promise<void> {
    try {
      const pending = await betRepository.listPendingBets('scorcerer');
      for (const bet of pending) {
        const baseline = await this.baselineStore.get(bet.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(bet);
        }
      }
    } catch (err) {
      console.error('[scorcerer] sync pending baselines failed', err);
    }
  }

  private async processGameUpdate(gameId: string, doc: RefinedGameDoc): Promise<void> {
    try {
      const snapshot = await this.captureSnapshot(gameId, doc);
      const isFinal = this.isFinalStatus(doc);
      const bets = await betRepository.listPendingBets('scorcerer', { gameId });
      if (!bets.length) {
        return;
      }

      for (const bet of bets) {
        const baseline = await this.baselineStore.get(bet.bet_id);
        if (!baseline) {
          await this.captureBaselineForBet(bet, doc);
        }
      }

      if (!snapshot.shouldProcess && !isFinal) {
        return;
      }

      for (const bet of bets) {
        await this.evaluateBet(bet, doc, snapshot, isFinal);
      }
    } catch (err) {
      console.error('[scorcerer] process game update error', { gameId }, err);
    }
  }

  private async evaluateBet(bet: BetProposal, doc: RefinedGameDoc, snapshot: SnapshotState, isFinal: boolean): Promise<void> {
    try {
      const baseline = (await this.baselineStore.get(bet.bet_id)) || (await this.captureBaselineForBet(bet, doc));
      if (!baseline) {
        console.warn('[scorcerer] baseline unavailable; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const totals = snapshot.totals;
      const delta = {
        td: totals.touchdowns - baseline.touchdowns,
        fg: totals.fieldGoals - baseline.fieldGoals,
        sfty: totals.safeties - baseline.safeties,
      };
      const choice = pickWinningChoice(delta);
      if (!choice) {
        if (isFinal) {
          await this.settleNoMoreScores(bet, totals, baseline, delta, snapshot);
        }
        return;
      }
      const updated = await betRepository.setWinningChoice(bet.bet_id, choice);
      if (!updated) return;
      await betRepository.recordHistory(bet.bet_id, this.resultEvent, {
        outcome: choice,
        totals,
        baseline,
        delta,
        captured_at: new Date().toISOString(),
        snapshot_hash: snapshot.previousHash,
      });
      await this.baselineStore.delete(bet.bet_id);
    } catch (err) {
      console.error('[scorcerer] evaluate bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private async settleNoMoreScores(
    bet: BetProposal,
    totals: AggregateTotals,
    baseline: BaselineSnapshot,
    delta: { td: number; fg: number; sfty: number },
    snapshot: SnapshotState,
  ): Promise<void> {
    const updated = await betRepository.setWinningChoice(bet.bet_id, 'No More Scores');
    if (!updated) return;
    await betRepository.recordHistory(bet.bet_id, this.resultEvent, {
      outcome: 'No More Scores',
      totals,
      baseline,
      delta,
      captured_at: new Date().toISOString(),
      snapshot_hash: snapshot.previousHash,
      reason: 'game_final_no_more_scores',
    });
    await this.baselineStore.delete(bet.bet_id);
  }

  private async captureBaselineForBet(
    bet: Partial<BetProposal> & { bet_id: string; nfl_game_id?: string | null },
    prefetchedDoc?: RefinedGameDoc | null,
  ): Promise<BaselineSnapshot | null> {
    const existing = await this.baselineStore.get(bet.bet_id);
    if (existing) return existing;
    const gameId = bet.nfl_game_id || null;
    if (!gameId) {
      console.warn('[scorcerer] missing game id for baseline capture', { bet_id: bet.bet_id });
      return null;
    }
    const doc = await ensureRefinedGameDoc(gameId, prefetchedDoc ?? null);
    if (!doc) {
      console.warn('[scorcerer] refined doc unavailable for baseline capture', { bet_id: bet.bet_id, gameId });
      return null;
    }
    const totals = await this.collectTotals(doc, gameId);
    const baseline: BaselineSnapshot = {
      touchdowns: totals.touchdowns,
      fieldGoals: totals.fieldGoals,
      safeties: totals.safeties,
      capturedAt: new Date().toISOString(),
      gameId,
    };
    await this.baselineStore.set(bet.bet_id, baseline);
    await betRepository.recordHistory(bet.bet_id, this.baselineEvent, {
      touchdowns: totals.touchdowns,
      fieldGoals: totals.fieldGoals,
      safeties: totals.safeties,
      captured_at: baseline.capturedAt,
    });
    return baseline;
  }

  private async captureSnapshot(gameId: string, doc: RefinedGameDoc): Promise<SnapshotState> {
    const totals = await this.collectTotals(doc, gameId);
    const signatureJson = JSON.stringify(totals);
    const signatureHash = createHash('sha256').update(signatureJson).digest('hex');
    const cached = await this.snapshotStore.get(gameId);
    if (cached?.signatureHash === signatureHash) {
      return { shouldProcess: false, previousHash: cached.signatureHash, totals };
    }
    const payload: SnapshotCacheEntry = {
      signatureHash,
      signatureJson: this.storeRawSnapshots ? signatureJson : undefined,
    };
    await this.snapshotStore.set(gameId, payload);
    return { shouldProcess: true, previousHash: cached?.signatureHash ?? null, totals };
  }

  private async collectTotals(doc: RefinedGameDoc, gameId: string): Promise<AggregateTotals> {
    const totals: AggregateTotals = { touchdowns: 0, fieldGoals: 0, safeties: 0, teamCount: 0 };
    const teams = Array.isArray(doc.teams) ? (doc.teams as any[]) : [];
    totals.teamCount = teams.length;
    for (const team of teams) {
      const scoring = ((team || {}) as any).stats?.scoring || {};
      totals.touchdowns += normalizeNumber(scoring.touchdowns);
      totals.fieldGoals += normalizeNumber(scoring.fieldGoals);
      totals.safeties += normalizeNumber(scoring.safeties);
    }
    if (teams.length === 0) {
      const supaTotals = await getTeamScoreStats(gameId, 'aggregate');
      totals.touchdowns += normalizeNumber((supaTotals as any)?.touchdowns);
      totals.fieldGoals += normalizeNumber((supaTotals as any)?.fieldGoals);
      totals.safeties += normalizeNumber((supaTotals as any)?.safeties);
    }
    return totals;
  }

  private isFinalStatus(doc: RefinedGameDoc | null | undefined): boolean {
    if (!doc) return false;
    const status = String((doc as any)?.status ?? '').trim().toUpperCase();
    if (!status) return false;
    if (status === 'STATUS_FINAL') return true;
    return status.startsWith('STATUS_FINAL');
  }
}

function pickWinningChoice(delta: { td: number; fg: number; sfty: number }): 'Touchdown' | 'Field Goal' | 'Safety' | null {
  if (delta.td > 0) return 'Touchdown';
  if (delta.fg > 0) return 'Field Goal';
  if (delta.sfty > 0) return 'Safety';
  return null;
}

export const scorcererValidator = new ScorcererValidatorService();
