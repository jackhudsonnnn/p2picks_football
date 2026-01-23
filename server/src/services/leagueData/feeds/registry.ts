/**
 * League Game Feed Registry
 *
 * Central registry for managing game feed providers across all leagues.
 * Supports dynamic starting/stopping of feeds based on active leagues.
 */

import type { League } from '../../../types/league';
import type {
  LeagueGameFeedProvider,
  LeagueGameFeedRegistry,
  GameFeedListener,
  GameFeedEvent,
  Unsubscribe,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Registry Implementation
// ─────────────────────────────────────────────────────────────────────────────

class GameFeedRegistryImpl implements LeagueGameFeedRegistry {
  private providers = new Map<League, LeagueGameFeedProvider>();

  register(provider: LeagueGameFeedProvider): void {
    if (this.providers.has(provider.league)) {
      console.warn(`[GameFeedRegistry] Overwriting existing provider for ${provider.league}`);
    }
    this.providers.set(provider.league, provider);
    console.log(`[GameFeedRegistry] Registered feed provider for ${provider.league}`);
  }

  get(league: League): LeagueGameFeedProvider | undefined {
    return this.providers.get(league);
  }

  has(league: League): boolean {
    return this.providers.has(league);
  }

  getRegisteredLeagues(): League[] {
    return Array.from(this.providers.keys());
  }

  startAll(): void {
    for (const provider of this.providers.values()) {
      if (!provider.isRunning()) {
        provider.start();
        console.log(`[GameFeedRegistry] Started ${provider.league} feed`);
      }
    }
  }

  stopAll(): void {
    for (const provider of this.providers.values()) {
      if (provider.isRunning()) {
        provider.stop();
        console.log(`[GameFeedRegistry] Stopped ${provider.league} feed`);
      }
    }
  }

  startLeagues(leagues: League[]): void {
    for (const league of leagues) {
      const provider = this.providers.get(league);
      if (provider && !provider.isRunning()) {
        provider.start();
        console.log(`[GameFeedRegistry] Started ${league} feed`);
      } else if (!provider) {
        console.warn(`[GameFeedRegistry] No feed provider registered for ${league}`);
      }
    }
  }

  stopLeagues(leagues: League[]): void {
    for (const league of leagues) {
      const provider = this.providers.get(league);
      if (provider && provider.isRunning()) {
        provider.stop();
        console.log(`[GameFeedRegistry] Stopped ${league} feed`);
      }
    }
  }
}

// Singleton instance
const feedRegistry = new GameFeedRegistryImpl();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a game feed provider for a league.
 */
export function registerFeedProvider(provider: LeagueGameFeedProvider): void {
  feedRegistry.register(provider);
}

/**
 * Get the game feed provider for a league.
 */
export function getFeedProvider(league: League): LeagueGameFeedProvider | undefined {
  return feedRegistry.get(league);
}

/**
 * Check if a feed provider exists for a league.
 */
export function hasFeedProvider(league: League): boolean {
  return feedRegistry.has(league);
}

/**
 * Get all registered leagues.
 */
export function getRegisteredFeedLeagues(): League[] {
  return feedRegistry.getRegisteredLeagues();
}

/**
 * Start all registered feeds.
 */
export function startAllFeeds(): void {
  feedRegistry.startAll();
}

/**
 * Stop all registered feeds.
 */
export function stopAllFeeds(): void {
  feedRegistry.stopAll();
}

/**
 * Start feeds for specific leagues.
 */
export function startLeagueFeeds(leagues: League[]): void {
  feedRegistry.startLeagues(leagues);
}

/**
 * Stop feeds for specific leagues.
 */
export function stopLeagueFeeds(leagues: League[]): void {
  feedRegistry.stopLeagues(leagues);
}

/**
 * Subscribe to game updates for a specific league.
 * @param league - The league to subscribe to
 * @param listener - Callback for game update events
 * @param emitReplay - If true, immediately emit cached games to the listener
 * @returns Unsubscribe function, or null if no provider exists for the league
 */
export function subscribeToLeagueFeed(
  league: League,
  listener: GameFeedListener,
  emitReplay = true,
): Unsubscribe | null {
  const provider = feedRegistry.get(league);
  if (!provider) {
    console.warn(`[GameFeedRegistry] No feed provider for ${league}`);
    return null;
  }
  return provider.subscribe(listener, emitReplay);
}

/**
 * Subscribe to game updates for multiple leagues.
 * @param leagues - The leagues to subscribe to
 * @param listener - Callback for game update events (includes league in event)
 * @param emitReplay - If true, immediately emit cached games to the listener
 * @returns Unsubscribe function that removes all subscriptions
 */
export function subscribeToLeagueFeeds(
  leagues: League[],
  listener: GameFeedListener,
  emitReplay = true,
): Unsubscribe {
  const unsubscribes: Unsubscribe[] = [];
  
  for (const league of leagues) {
    const unsub = subscribeToLeagueFeed(league, listener, emitReplay);
    if (unsub) {
      unsubscribes.push(unsub);
    }
  }
  
  return () => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  };
}

/**
 * Get cached game info from the appropriate league feed.
 */
export function getCachedGameInfo(league: League, gameId: string) {
  const provider = feedRegistry.get(league);
  return provider?.getCached(gameId) ?? null;
}

/**
 * Get cached signature from the appropriate league feed.
 */
export function getCachedSignature(league: League, gameId: string): string | null {
  const provider = feedRegistry.get(league);
  return provider?.getCachedSignature(gameId) ?? null;
}
