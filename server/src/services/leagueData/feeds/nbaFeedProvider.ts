/**
 * NBA Game Feed Provider
 *
 * Implements the LeagueGameFeedProvider interface for NBA games.
 * Wraps the existing nbaGameFeedService to provide unified feed access.
 */

import { EventEmitter } from 'events';
import type { LeagueGameFeedProvider, GameFeedListener, GameFeedEvent, Unsubscribe } from './types';
import type { GameInfo, GameStatus } from '../types';
import type { League } from '../../../types/league';
import {
  startNbaGameFeedService,
  stopNbaGameFeedService,
  subscribeToNbaGameFeed,
  type NbaGameFeedEvent,
} from '../../nbaData/nbaGameFeedService';

// ─────────────────────────────────────────────────────────────────────────────
// Status Mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapNbaStatusToGameStatus(status: string | undefined): GameStatus {
  if (!status) return 'STATUS_UNKNOWN';
  
  const normalized = status.toUpperCase();
  
  if (normalized.includes('SCHEDULED') || normalized.includes('PRE')) {
    return 'STATUS_SCHEDULED';
  }
  if (normalized.includes('IN_PROGRESS') || normalized.includes('IN PROGRESS') || normalized === 'IN') {
    return 'STATUS_IN_PROGRESS';
  }
  if (normalized.includes('HALFTIME') || normalized.includes('HALF')) {
    return 'STATUS_HALFTIME';
  }
  if (normalized.includes('END_PERIOD') || normalized.includes('END PERIOD')) {
    return 'STATUS_END_PERIOD';
  }
  if (normalized.includes('FINAL') || normalized.includes('POST')) {
    return 'STATUS_FINAL';
  }
  if (normalized.includes('POSTPONED')) {
    return 'STATUS_POSTPONED';
  }
  if (normalized.includes('CANCELED') || normalized.includes('CANCELLED')) {
    return 'STATUS_CANCELED';
  }
  
  return 'STATUS_UNKNOWN';
}

// ─────────────────────────────────────────────────────────────────────────────
// NBA Feed Provider
// ─────────────────────────────────────────────────────────────────────────────

class NbaGameFeedProvider implements LeagueGameFeedProvider {
  readonly league: League = 'NBA';
  
  private emitter = new EventEmitter();
  private running = false;
  private nbaUnsubscribe: Unsubscribe | null = null;
  private cache = new Map<string, { gameInfo: GameInfo; signature: string }>();
  
  private static readonly GAME_UPDATE_EVENT = 'game-update';

  start(): void {
    if (this.running) return;
    this.running = true;
    
    // Start the underlying NBA feed service
    startNbaGameFeedService();
    
    // Subscribe to NBA events and transform them
    this.nbaUnsubscribe = subscribeToNbaGameFeed((event: NbaGameFeedEvent) => {
      const transformed = this.transformEvent(event);
      if (transformed) {
        this.cache.set(event.gameId, {
          gameInfo: transformed.gameInfo,
          signature: transformed.signature,
        });
        this.emitter.emit(NbaGameFeedProvider.GAME_UPDATE_EVENT, transformed);
      }
    }, true);
    
    console.log('[NbaGameFeedProvider] Started');
  }

  stop(): void {
    if (!this.running) return;
    
    if (this.nbaUnsubscribe) {
      this.nbaUnsubscribe();
      this.nbaUnsubscribe = null;
    }
    
    stopNbaGameFeedService();
    this.cache.clear();
    this.running = false;
    
    console.log('[NbaGameFeedProvider] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: GameFeedListener, emitReplay = true): Unsubscribe {
    this.emitter.on(NbaGameFeedProvider.GAME_UPDATE_EVENT, listener);
    
    if (emitReplay) {
      // Emit cached games to the new listener
      queueMicrotask(() => {
        for (const [gameId, cached] of this.cache.entries()) {
          listener({
            league: 'NBA',
            gameId,
            gameInfo: cached.gameInfo,
            signature: cached.signature,
            updatedAt: new Date().toISOString(),
          });
        }
      });
    }
    
    return () => {
      this.emitter.off(NbaGameFeedProvider.GAME_UPDATE_EVENT, listener);
    };
  }

  getCached(gameId: string): GameInfo | null {
    const cached = this.cache.get(gameId);
    return cached?.gameInfo ?? null;
  }

  getCachedSignature(gameId: string): string | null {
    const cached = this.cache.get(gameId);
    return cached?.signature ?? null;
  }

  getCachedGameIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Transform NBA-specific event to unified GameFeedEvent format.
   */
  private transformEvent(event: NbaGameFeedEvent): GameFeedEvent | null {
    const { gameId, doc, signature, updatedAt } = event;
    
    if (!doc) return null;

    // Extract teams
    const homeTeamRaw = doc.teams?.find((t: any) => t.homeAway === 'home');
    const awayTeamRaw = doc.teams?.find((t: any) => t.homeAway === 'away');

    const gameInfo: GameInfo = {
      gameId,
      league: 'NBA',
      status: mapNbaStatusToGameStatus(doc.status),
      statusText: doc.status,
      period: typeof doc.period === 'number' ? doc.period : null,
      clock: doc.gameClock,
      homeTeam: homeTeamRaw ? {
        teamId: homeTeamRaw.teamId ?? '',
        abbreviation: homeTeamRaw.abbreviation ?? '',
        displayName: homeTeamRaw.displayName ?? homeTeamRaw.abbreviation ?? '',
        score: homeTeamRaw.score ?? 0,
        homeAway: 'home',
        raw: homeTeamRaw,
      } : null,
      awayTeam: awayTeamRaw ? {
        teamId: awayTeamRaw.teamId ?? '',
        abbreviation: awayTeamRaw.abbreviation ?? '',
        displayName: awayTeamRaw.displayName ?? awayTeamRaw.abbreviation ?? '',
        score: awayTeamRaw.score ?? 0,
        homeAway: 'away',
        raw: awayTeamRaw,
      } : null,
    };

    return {
      league: 'NBA',
      gameId,
      gameInfo,
      signature,
      updatedAt,
      raw: doc,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────────────────────────────────────

export const nbaGameFeedProvider = new NbaGameFeedProvider();
