/**
 * NFL Game Feed Provider
 *
 * Implements the LeagueGameFeedProvider interface for NFL games.
 * Wraps the existing nflGameFeedService to provide unified feed access.
 */

import { EventEmitter } from 'events';
import type { LeagueGameFeedProvider, GameFeedListener, GameFeedEvent, Unsubscribe } from './types';
import type { GameInfo, GameStatus } from '../types';
import type { League } from '../../../types/league';
import {
  startNflGameFeedService,
  stopNflGameFeedService,
  subscribeToNflGameFeed,
  type NflGameFeedEvent,
} from '../../nflData/nflGameFeedService';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('NflGameFeedProvider');

// ─────────────────────────────────────────────────────────────────────────────
// Status Mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapNflStatusToGameStatus(status: string | undefined): GameStatus {
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
// NFL Feed Provider
// ─────────────────────────────────────────────────────────────────────────────

class NflGameFeedProvider implements LeagueGameFeedProvider {
  readonly league: League = 'NFL';
  
  private emitter = new EventEmitter();
  private running = false;
  private nflUnsubscribe: Unsubscribe | null = null;
  private cache = new Map<string, { gameInfo: GameInfo; signature: string }>();
  
  private static readonly GAME_UPDATE_EVENT = 'game-update';

  start(): void {
    if (this.running) return;
    this.running = true;
    
    // Start the underlying NFL feed service
    startNflGameFeedService();
    
    // Subscribe to NFL events and transform them
    this.nflUnsubscribe = subscribeToNflGameFeed((event: NflGameFeedEvent) => {
      const transformed = this.transformEvent(event);
      if (transformed) {
        this.cache.set(event.gameId, {
          gameInfo: transformed.gameInfo,
          signature: transformed.signature,
        });
        this.emitter.emit(NflGameFeedProvider.GAME_UPDATE_EVENT, transformed);
      }
    }, true);
    
    logger.info({}, 'Started');
  }

  stop(): void {
    if (!this.running) return;
    
    if (this.nflUnsubscribe) {
      this.nflUnsubscribe();
      this.nflUnsubscribe = null;
    }
    
    stopNflGameFeedService();
    this.cache.clear();
    this.running = false;
    
    logger.info({}, 'Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: GameFeedListener, emitReplay = true): Unsubscribe {
    this.emitter.on(NflGameFeedProvider.GAME_UPDATE_EVENT, listener);
    
    if (emitReplay) {
      // Emit cached games to the new listener
      queueMicrotask(() => {
        for (const [gameId, cached] of this.cache.entries()) {
          listener({
            league: 'NFL',
            gameId,
            gameInfo: cached.gameInfo,
            signature: cached.signature,
            updatedAt: new Date().toISOString(),
          });
        }
      });
    }
    
    return () => {
      this.emitter.off(NflGameFeedProvider.GAME_UPDATE_EVENT, listener);
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
   * Transform NFL-specific event to unified GameFeedEvent format.
   */
  private transformEvent(event: NflGameFeedEvent): GameFeedEvent | null {
    const { gameId, doc, signature, updatedAt } = event;
    
    if (!doc) return null;

    // Extract teams
    const homeTeamRaw = doc.teams?.find((t: any) => t.homeAway === 'home');
    const awayTeamRaw = doc.teams?.find((t: any) => t.homeAway === 'away');

    const gameInfo: GameInfo = {
      gameId,
      league: 'NFL',
      status: mapNflStatusToGameStatus(doc.status),
      statusText: doc.status,
      period: typeof doc.period === 'number' ? doc.period : null,
      clock: undefined, // NFL refined data doesn't include clock
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
      league: 'NFL',
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

export const nflGameFeedProvider = new NflGameFeedProvider();
