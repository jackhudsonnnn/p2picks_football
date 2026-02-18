/**
 * BetLifecycleService — thin wrapper around the BullMQ-based lifecycle queue.
 *
 * Previously used in-process setTimeout / setInterval timers which were:
 *   - Not safe across multiple server replicas (double-fire race)
 *   - Lost on process restart
 *
 * Now delegates entirely to betLifecycleQueue.ts which uses BullMQ delayed
 * jobs deduplicated by betId.
 */

import {
  startBetLifecycleQueue,
  stopBetLifecycleQueue,
  enqueueBetLifecycle,
} from './betLifecycleQueue';

export function startBetLifecycleService(): void {
  void startBetLifecycleQueue();
}

export async function stopBetLifecycleService(): Promise<void> {
  await stopBetLifecycleQueue();
}

export function registerBetLifecycle(betId: string, closeTimeIso?: string | null): void {
  if (!betId) return;
  void enqueueBetLifecycle(betId, closeTimeIso);
}

