/**
 * League Game Feeds Module
 *
 * Unified entry point for game feed subscriptions across all leagues.
 * Provides a per-league kernel architecture where each league has its
 * own independent feed provider.
 */

// Types
export type {
  GameFeedEvent,
  GameFeedListener,
  Unsubscribe,
  LeagueGameFeedProvider,
  LeagueGameFeedRegistry,
} from './types';

// Registry functions
export {
  registerFeedProvider,
  getFeedProvider,
  hasFeedProvider,
  getRegisteredFeedLeagues,
  startAllFeeds,
  stopAllFeeds,
  startLeagueFeeds,
  stopLeagueFeeds,
  subscribeToLeagueFeed,
  subscribeToLeagueFeeds,
  getCachedGameInfo,
  getCachedSignature,
} from './registry';

// Feed providers
export { nflGameFeedProvider } from './nflFeedProvider';
export { nbaGameFeedProvider } from './nbaFeedProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-registration
// ─────────────────────────────────────────────────────────────────────────────

import { registerFeedProvider } from './registry';
import { nflGameFeedProvider } from './nflFeedProvider';
import { nbaGameFeedProvider } from './nbaFeedProvider';

/**
 * Initialize all feed providers.
 * Call this once at application startup.
 */
export function initializeFeedProviders(): void {
  // Register NFL feed provider
  registerFeedProvider(nflGameFeedProvider);
  
  // Register NBA feed provider
  registerFeedProvider(nbaGameFeedProvider);
  
  console.log('[GameFeeds] Feed providers initialized');
}
