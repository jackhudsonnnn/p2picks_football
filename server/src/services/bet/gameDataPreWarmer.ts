/**
 * Game Data Pre-Warmer
 *
 * Fires off non-blocking requests to populate the league data provider
 * cache (game status, home/away team) early — before the user finishes
 * configuring their bet.
 *
 * Called from `createModeConfigSession` as a fire-and-forget side effect.
 * Errors are caught and logged; they must never propagate to the caller.
 */

import type { League } from '../../types/league';
import { hasLeagueProvider } from '../leagueData';
import { createLogger } from '../../utils/logger';

const logger = createLogger('gameDataPreWarmer');

/**
 * Pre-warm game data into the league provider cache.
 *
 * This is intentionally fire-and-forget — the promise is not awaited by
 * the caller.  If the league provider is not registered (e.g. U2Pick)
 * or the game ID is empty, the call is silently skipped.
 */
export function preWarmGameData(league: League, leagueGameId: string): void {
  if (!leagueGameId || !leagueGameId.trim()) {
    return;
  }

  // Skip leagues with no external game data (e.g. U2Pick)
  if (!hasLeagueProvider(league)) {
    return;
  }

  // Dynamically import to avoid circular dependencies at module load time.
  // The league data functions are thin wrappers around the already-initialized
  // provider, so the import is cheap.
  void (async () => {
    try {
      const { getGameStatus, getHomeTeam, getAwayTeam } = await import('../leagueData');
      await Promise.all([
        getGameStatus(league, leagueGameId),
        getHomeTeam(league, leagueGameId),
        getAwayTeam(league, leagueGameId),
      ]);
      logger.debug({ league, leagueGameId }, 'game data pre-warmed');
    } catch (err) {
      logger.warn(
        { league, leagueGameId, error: err instanceof Error ? err.message : String(err) },
        'game data pre-warm failed (non-fatal)',
      );
    }
  })();
}
