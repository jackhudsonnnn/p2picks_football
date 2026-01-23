/**
 * Mode Validator Service
 *
 * Manages the lifecycle of mode validators across all leagues.
 * Uses the per-league kernel architecture for isolation and scalability.
 *
 * @deprecated Use startModeRuntime/stopModeRuntime from leagueData for new code.
 * This module is a compatibility wrapper during migration.
 */

import {
  startModeRuntime,
  stopModeRuntime,
  isModeRuntimeInitialized,
} from '../leagueData';

let startPromise: Promise<void> | null = null;

/**
 * Start mode validators for all active leagues.
 * Uses the new per-league kernel architecture.
 */
export async function startModeValidators(): Promise<void> {
  if (isModeRuntimeInitialized()) return;
  
  // Ensure we don't start multiple times in parallel
  if (startPromise) {
    return startPromise;
  }
  
  startPromise = startModeRuntime();
  
  try {
    await startPromise;
  } finally {
    startPromise = null;
  }
}

/**
 * Stop mode validators for all leagues.
 */
export function stopModeValidators(): void {
  stopModeRuntime();
}
