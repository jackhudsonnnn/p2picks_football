/**
 * Mode Runtime Orchestrator
 *
 * Orchestrates the startup of league kernels based on which leagues
 * have registered modes. Uses the mode registry to determine active
 * leagues and starts per-league kernels dynamically.
 *
 * Usage:
 * ```typescript
 * import { startModeRuntime, stopModeRuntime } from './orchestrator';
 *
 * // At application startup
 * await startModeRuntime();
 *
 * // At application shutdown
 * stopModeRuntime();
 * ```
 */

import { ensureInitialized, getActiveLeagues } from '../../../modes';
import { initializeFeedProviders } from '../feeds';
import { startLeagueKernels, stopAllKernels, getRunningKernels } from '../kernel';
import type { League } from '../../../types/league';

let initialized = false;

/**
 * Start the mode runtime.
 * 
 * 1. Initializes the mode registry
 * 2. Initializes feed providers
 * 3. Determines which leagues have active modes
 * 4. Starts a kernel for each active league
 */
export async function startModeRuntime(): Promise<void> {
  if (initialized) {
    console.log('[ModeRuntime] Already initialized');
    return;
  }

  console.log('[ModeRuntime] Starting...');

  // Initialize mode registry
  await ensureInitialized();
  console.log('[ModeRuntime] Mode registry initialized');

  // Initialize feed providers
  initializeFeedProviders();
  console.log('[ModeRuntime] Feed providers initialized');

  // Get leagues that have registered modes
  const activeLeagues = getActiveLeagues();
  console.log(`[ModeRuntime] Active leagues: ${activeLeagues.join(', ') || 'none'}`);

  if (activeLeagues.length === 0) {
    console.warn('[ModeRuntime] No active leagues found, no kernels started');
    initialized = true;
    return;
  }

  // Start kernels for each active league
  await startLeagueKernels(activeLeagues);
  
  const runningKernels = getRunningKernels();
  console.log(`[ModeRuntime] Started ${runningKernels.length} kernels`);
  
  initialized = true;
  console.log('[ModeRuntime] Ready');
}

/**
 * Stop the mode runtime.
 * Stops all running kernels.
 */
export function stopModeRuntime(): void {
  if (!initialized) {
    console.log('[ModeRuntime] Not initialized');
    return;
  }

  console.log('[ModeRuntime] Stopping...');
  stopAllKernels();
  initialized = false;
  console.log('[ModeRuntime] Stopped');
}

/**
 * Get the current status of the mode runtime.
 */
export function getModeRuntimeStatus(): {
  initialized: boolean;
  activeLeagues: League[];
  runningKernels: number;
} {
  const runningKernels = getRunningKernels();
  return {
    initialized,
    activeLeagues: runningKernels.map(k => k.league),
    runningKernels: runningKernels.length,
  };
}

/**
 * Check if the mode runtime is initialized.
 */
export function isModeRuntimeInitialized(): boolean {
  return initialized;
}
