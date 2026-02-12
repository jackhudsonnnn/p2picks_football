/**
 * ModeRuntimeKernel - Generalized runtime kernel for mode validators.
 *
 * Provides:
 * - Game feed subscription (NFL, NBA, or other leagues)
 * - Pending bet monitoring via Supabase realtime
 * - Lifecycle management (start/stop)
 *
 * This is the league-agnostic version that accepts a league parameter
 * to determine which game feed to subscribe to.
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../supabaseClient';
import { subscribeToNflGameFeed, type NflGameFeedEvent } from '../../services/nflData/nflGameFeedService';
import { subscribeToNbaGameFeed, type NbaGameFeedEvent } from '../../services/nbaData/nbaGameFeedService';
import type { League } from '../../types/league';
import type { GameFeedEvent } from './gameFeedTypes';
import { createLogger } from '../../utils/logger';

interface KernelHandlers {
  onGameEvent?: (event: GameFeedEvent) => Promise<void> | void;
  onPendingUpdate?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => Promise<void> | void;
  onPendingDelete?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => Promise<void> | void;
  onReady?: () => Promise<void> | void;
}

export interface KernelOptions extends KernelHandlers {
  /** The league this kernel monitors (NFL, NBA, etc.) */
  league: League;
  /** Unique mode key (e.g., 'either_or', 'nba_score_sorcerer') */
  modeKey: string;
  /** Optional custom channel name for pending bets realtime subscription */
  channelName?: string;
  /** Optional custom filter for pending bets (default: mode_key=eq.{modeKey}) */
  pendingFilter?: string;
  /** Whether to dedupe game feed events by signature (default: true) */
  dedupeGameFeed?: boolean;
}

export class ModeRuntimeKernel {
  private readonly supabase = getSupabaseAdmin();
  private readonly logger;
  private unsubscribe: (() => void) | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private readonly lastSignatureByGame = new Map<string, string>();

  constructor(private readonly options: KernelOptions) {
    this.logger = createLogger(`kernel:${options.modeKey}`);
  }

  start(): void {
    this.startPendingMonitor();
    this.startFeedSubscription();
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.pendingChannel) {
      this.pendingChannel.unsubscribe().catch((err: unknown) => {
        this.logger.error({ error: err instanceof Error ? err.message : String(err) }, 'pending channel unsubscribe error');
      });
      this.pendingChannel = null;
    }
    this.lastSignatureByGame.clear();
  }

  private startFeedSubscription(): void {
    if (this.unsubscribe || !this.options.onGameEvent) return;

    const subscriber = this.getGameFeedSubscriber();
    if (!subscriber) {
      this.logger.warn({ league: this.options.league }, `No game feed subscriber for league: ${this.options.league}`);
      return;
    }

    this.unsubscribe = subscriber(async (event: GameFeedEvent) => {
      if (this.options.dedupeGameFeed !== false) {
        const previous = this.lastSignatureByGame.get(event.gameId);
        if (previous === event.signature) {
          return;
        }
        this.lastSignatureByGame.set(event.gameId, event.signature);
      }
      await this.options.onGameEvent?.(event);
    });
  }

  private getGameFeedSubscriber(): ((listener: (event: GameFeedEvent) => void | Promise<void>, emitReplay?: boolean) => () => void) | null {
    switch (this.options.league) {
      case 'NFL':
        return (listener, emitReplay) => subscribeToNflGameFeed(
          (event: NflGameFeedEvent) => listener(event as GameFeedEvent),
          emitReplay
        );
      case 'NBA':
        return (listener, emitReplay) => subscribeToNbaGameFeed(
          (event: NbaGameFeedEvent) => listener(event as GameFeedEvent),
          emitReplay
        );
      default:
        // Future leagues can be added here
        return null;
    }
  }


  private startPendingMonitor(): void {
    if (this.pendingChannel || (!this.options.onPendingUpdate && !this.options.onPendingDelete)) return;
    const channelName = this.options.channelName ?? `${this.options.modeKey}-pending`;
    const filter = this.options.pendingFilter ?? `mode_key=eq.${this.options.modeKey}`;
    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter },
        (payload) => {
          void this.options.onPendingUpdate?.(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bet_proposals', filter },
        (payload) => {
          void this.options.onPendingDelete?.(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.options.onReady?.();
        }
      });
    this.pendingChannel = channel;
  }
}
