/**
 * League Kernel
 *
 * Per-league runtime that manages mode validators and game feed subscriptions.
 * Each league has its own independent kernel for isolation and scalability.
 *
 * Architecture:
 * - Each kernel subscribes to its league's game feed
 * - Mode validators for that league receive game updates
 * - Kernels can be started/stopped independently
 */

import type { League } from '../../../types/league';
import type { ModeValidator } from '../../../leagues/sharedUtils/types';
import { listModesForLeague, ensureInitialized } from '../../../leagues';
import {
  getFeedProvider,
  subscribeToLeagueFeed,
  type GameFeedEvent,
  type Unsubscribe,
} from '../feeds';
import { createLogger } from '../../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Kernel Class
// ─────────────────────────────────────────────────────────────────────────────

export class LeagueKernel {
  readonly league: League;
  private readonly logger;
  
  private validators: ModeValidator[] = [];
  private feedUnsubscribe: Unsubscribe | null = null;
  private running = false;

  constructor(league: League) {
    this.league = league;
    this.logger = createLogger(`LeagueKernel:${league}`);
  }

  /**
   * Start the kernel: subscribe to game feed and start mode validators.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.info({}, 'Already running');
      return;
    }

    await ensureInitialized();

    // Get modes for this league
    const modes = listModesForLeague(this.league);
    this.logger.info({ modeCount: modes.length }, `Found ${modes.length} modes`);

    // Start mode validators
    for (const mode of modes) {
      if (!mode.validator) continue;
      
      try {
        mode.validator.start();
        this.validators.push(mode.validator);
        this.logger.info({ modeKey: mode.key }, `Started validator for ${mode.key}`);
      } catch (err) {
        this.logger.error({ modeKey: mode.key, error: err instanceof Error ? err.message : String(err) }, `Failed to start validator for ${mode.key}`);
        throw err;
      }
    }

    // Subscribe to game feed for this league
    const feedProvider = getFeedProvider(this.league);
    if (feedProvider) {
      // Ensure the feed is running
      if (!feedProvider.isRunning()) {
        feedProvider.start();
      }
      
      this.feedUnsubscribe = subscribeToLeagueFeed(
        this.league,
        (event: GameFeedEvent) => this.onGameUpdate(event),
        true, // Emit replay of cached games
      );
      this.logger.info({}, 'Subscribed to game feed');
    } else {
      this.logger.warn({}, 'No feed provider available');
    }

    this.running = true;
    this.logger.info({ validatorCount: this.validators.length }, `Started with ${this.validators.length} validators`);
  }

  /**
   * Stop the kernel: unsubscribe from feed and stop validators.
   */
  stop(): void {
    if (!this.running) {
      this.logger.info({}, 'Not running');
      return;
    }

    // Unsubscribe from game feed
    if (this.feedUnsubscribe) {
      this.feedUnsubscribe();
      this.feedUnsubscribe = null;
    }

    // Stop all validators
    while (this.validators.length) {
      const validator = this.validators.pop();
      if (!validator) continue;
      
      try {
        validator.stop();
      } catch (err) {
        this.logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to stop validator');
      }
    }

    this.running = false;
    this.logger.info({}, 'Stopped');
  }

  /**
   * Check if the kernel is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get count of active validators.
   */
  getValidatorCount(): number {
    return this.validators.length;
  }

  /**
   * Handle game update from the feed.
   * Override in subclasses for custom behavior.
   */
  protected onGameUpdate(event: GameFeedEvent): void {
    // Default: log update (validators handle their own subscriptions)
    // This hook is available for kernel-level game processing if needed
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kernel Manager
// ─────────────────────────────────────────────────────────────────────────────

const kernels = new Map<League, LeagueKernel>();

/**
 * Get or create a kernel for a league.
 */
export function getKernel(league: League): LeagueKernel {
  let kernel = kernels.get(league);
  if (!kernel) {
    kernel = new LeagueKernel(league);
    kernels.set(league, kernel);
  }
  return kernel;
}

/**
 * Start kernel for a specific league.
 */
export async function startLeagueKernel(league: League): Promise<LeagueKernel> {
  const kernel = getKernel(league);
  await kernel.start();
  return kernel;
}

/**
 * Stop kernel for a specific league.
 */
export function stopLeagueKernel(league: League): void {
  const kernel = kernels.get(league);
  if (kernel) {
    kernel.stop();
  }
}

/**
 * Start kernels for multiple leagues.
 */
export async function startLeagueKernels(leagues: League[]): Promise<void> {
  await Promise.all(leagues.map(league => startLeagueKernel(league)));
}

/**
 * Stop all running kernels.
 */
export function stopAllKernels(): void {
  for (const kernel of kernels.values()) {
    kernel.stop();
  }
}

/**
 * Get all running kernels.
 */
export function getRunningKernels(): LeagueKernel[] {
  return Array.from(kernels.values()).filter(k => k.isRunning());
}

/**
 * Check if a kernel is running for a league.
 */
export function isKernelRunning(league: League): boolean {
  const kernel = kernels.get(league);
  return kernel?.isRunning() ?? false;
}
