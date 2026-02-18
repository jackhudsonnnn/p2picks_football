import { getGameStatus } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { formatNumber } from '../../../../utils/number';
import { BaseValidatorService } from '../../../sharedUtils/baseValidatorService';
import {
  type SpreadConfig as SpreadTheWealthConfig,
  describeSpread,
  evaluateSpread,
  normalizeSpread,
} from '../../../sharedUtils/spreadEvaluator';
import {
  SPREAD_MODE_KEY,
  SPREAD_LABEL,
  SPREAD_CHANNEL,
  SPREAD_STORE_PREFIX,
  SPREAD_RESULT_EVENT,
  SPREAD_BASELINE_EVENT,
} from './constants';

export class SpreadTheWealthValidatorService extends BaseValidatorService<SpreadTheWealthConfig, Record<string, never>> {
  constructor() {
    super({
      league: 'NFL',
      modeKey: SPREAD_MODE_KEY,
      channelName: SPREAD_CHANNEL,
      storeKeyPrefix: SPREAD_STORE_PREFIX,
      modeLabel: SPREAD_LABEL,
      resultEvent: SPREAD_RESULT_EVENT,
      baselineEvent: SPREAD_BASELINE_EVENT,
      storeTtlSeconds: 60 * 60, // unused store, short TTL
    });
  }

  protected async onBetBecamePending(): Promise<void> {
    // no baseline/state to capture
  }

  protected async onGameUpdate(gameId: string): Promise<void> {
    const league: League = 'NFL'; // Default for nfl_modes
    const status = await getGameStatus(league, gameId);
    const halftimeResolveAt =
      ALLOWED_RESOLVE_AT.find((value) => value.toLowerCase() === 'halftime') ?? 'Halftime';

    if (status === 'STATUS_HALFTIME') {
      await this.processResolutions(gameId, halftimeResolveAt);
      return;
    }

    if (status === 'STATUS_FINAL') {
      await this.processResolutions(gameId, halftimeResolveAt);
      await this.processResolutions(gameId, DEFAULT_RESOLVE_AT);
    }
  }

  protected async onKernelReady(): Promise<void> {
    // nothing to sync for this mode
  }

  private async processResolutions(gameId: string, resolveAt: string): Promise<void> {
    const bets = await this.listPendingBets({ gameId });
    for (const bet of bets) {
      await this.resolveBet(bet.bet_id, resolveAt);
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
      const spread = normalizeSpread(config);
      if (spread == null) {
        await this.washBet(
          betId,
          { reason: 'invalid_spread', config },
          describeSpread(config) ?? 'Invalid spread configuration.',
        );
        return;
      }
      const evaluation = await evaluateSpread(config, spread, 'NFL');

      const allowsTie = Number.isInteger(spread);

      const homeChoice = config.home_team_name ?? 'Home Team';
      const awayChoice = config.away_team_name ?? 'Away Team';

      if (evaluation.decision === 'tie') {
        if (!allowsTie) {
          await this.washBet(
            betId,
            {
              reason: 'push',
              home_score: evaluation.homeScore,
              away_score: evaluation.awayScore,
              spread,
            },
            `Adjusted home score matched away score (${formatNumber(evaluation.adjustedHomeScore)} vs ${formatNumber(
              evaluation.awayScore,
            )}).`,
          );
          return;
        }

        await this.resolveWithWinner(betId, 'Tie', {
          eventType: this.config.resultEvent,
          payload: {
            outcome: 'Tie',
            home_score: evaluation.homeScore,
            away_score: evaluation.awayScore,
            adjusted_home: evaluation.adjustedHomeScore,
            spread,
            spread_label: config.spread_label ?? config.spread ?? null,
            captured_at: new Date().toISOString(),
          },
        });
        return;
      }

      const winningChoice = allowsTie
        ? evaluation.decision === 'home'
          ? homeChoice
          : awayChoice
        : evaluation.decision === 'home'
        ? homeChoice
        : awayChoice;
      await this.resolveWithWinner(betId, winningChoice, {
        eventType: this.config.resultEvent,
        payload: {
          outcome: winningChoice,
          home_score: evaluation.homeScore,
          away_score: evaluation.awayScore,
          adjusted_home: evaluation.adjustedHomeScore,
          spread,
          spread_label: config.spread_label ?? config.spread ?? null,
          resolve_at: config.resolve_at ?? DEFAULT_RESOLVE_AT,
          captured_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logError('resolve bet error', { betId }, err);
    }
  }
}

export const spreadTheWealthValidator = new SpreadTheWealthValidatorService();
