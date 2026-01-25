/**
 * League Feed Types
 *
 * Unified types for game feed subscriptions across all leagues.
 * Enables per-league kernels that subscribe to their respective feeds.
 */

import type { League } from '../../../types/league';
import type { GameInfo } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Feed Event Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified game update event emitted by all league feeds.
 */
export interface GameFeedEvent {
  /** The league this event is from */
  league: League;
  /** The game ID */
  gameId: string;
  /** Current game info snapshot */
  gameInfo: GameInfo;
  /** Signature for change detection (hash of relevant fields) */
  signature: string;
  /** When this update was processed */
  updatedAt: string;
  /** Raw league-specific data (for advanced mode logic) */
  raw?: unknown;
}

/**
 * Listener function for game feed events.
 */
export type GameFeedListener = (event: GameFeedEvent) => void;

/**
 * Unsubscribe function returned when subscribing to a feed.
 */
export type Unsubscribe = () => void;

// ─────────────────────────────────────────────────────────────────────────────
// Feed Provider Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for league-specific game feed providers.
 * Each league implements this to provide real-time game updates.
 */
export interface LeagueGameFeedProvider {
  /** The league this feed handles */
  readonly league: League;

  /** Start watching for game updates */
  start(): void;

  /** Stop watching for game updates */
  stop(): void;

  /** Check if the feed is currently running */
  isRunning(): boolean;

  /**
   * Subscribe to game updates.
   * @param listener - Callback for game update events
   * @param emitReplay - If true, immediately emit cached games to the listener
   * @returns Unsubscribe function
   */
  subscribe(listener: GameFeedListener, emitReplay?: boolean): Unsubscribe;

  /**
   * Get cached game info for a specific game.
   * @param gameId - The game ID
   * @returns Cached game info or null if not cached
   */
  getCached(gameId: string): GameInfo | null;

  /**
   * Get cached signature for a specific game.
   * @param gameId - The game ID
   * @returns Cached signature or null if not cached
   */
  getCachedSignature(gameId: string): string | null;

  /**
   * Get all cached game IDs.
   */
  getCachedGameIds(): string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed Registry Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry for managing league game feed providers.
 */
export interface LeagueGameFeedRegistry {
  /** Register a feed provider for a league */
  register(provider: LeagueGameFeedProvider): void;

  /** Get the feed provider for a league */
  get(league: League): LeagueGameFeedProvider | undefined;

  /** Check if a feed provider exists for a league */
  has(league: League): boolean;

  /** Get all registered leagues */
  getRegisteredLeagues(): League[];

  /** Start all registered feeds */
  startAll(): void;

  /** Stop all registered feeds */
  stopAll(): void;

  /** Start feed for specific leagues */
  startLeagues(leagues: League[]): void;

  /** Stop feed for specific leagues */
  stopLeagues(leagues: League[]): void;
}
