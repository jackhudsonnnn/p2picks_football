import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../supabaseClient';
import { subscribeToGameFeed, type GameFeedEvent } from '../../services/gameFeedService';

export interface KernelHandlers {
  onGameEvent?: (event: GameFeedEvent) => Promise<void> | void;
  onPendingUpdate?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => Promise<void> | void;
  onPendingDelete?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => Promise<void> | void;
  onReady?: () => Promise<void> | void;
}

export interface KernelOptions extends KernelHandlers {
  modeKey: string;
  channelName?: string;
  pendingFilter?: string;
  dedupeGameFeed?: boolean;
}

export class ModeRuntimeKernel {
  private readonly supa = getSupabaseAdmin();
  private unsubscribe: (() => void) | null = null;
  private pendingChannel: RealtimeChannel | null = null;
  private readonly lastSignatureByGame = new Map<string, string>();

  constructor(private readonly options: KernelOptions) {}

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
        console.error(`[kernel:${this.options.modeKey}] pending channel unsubscribe error`, err);
      });
      this.pendingChannel = null;
    }
    this.lastSignatureByGame.clear();
  }

  private startFeedSubscription(): void {
    if (this.unsubscribe || !this.options.onGameEvent) return;
    this.unsubscribe = subscribeToGameFeed(async (event) => {
      if (this.options.dedupeGameFeed) {
        const previous = this.lastSignatureByGame.get(event.gameId);
        if (previous === event.signature) {
          return;
        }
        this.lastSignatureByGame.set(event.gameId, event.signature);
      }
      await this.options.onGameEvent?.(event);
    });
  }

  private startPendingMonitor(): void {
    if (this.pendingChannel || (!this.options.onPendingUpdate && !this.options.onPendingDelete)) return;
    const channelName = this.options.channelName ?? `${this.options.modeKey}-pending`;
    const filter = this.options.pendingFilter ?? `mode_key=eq.${this.options.modeKey}`;
    const channel = this.supa
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
