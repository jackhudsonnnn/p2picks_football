/**
 * NFL UserConfigBuilder
 *
 * Re-exports shared utilities from sharedUtils/userConfigBuilder
 * and adds NFL-specific functionality.
 */

// Re-export all shared utilities
export {
  loadGameContext,
  buildStatStep,
  buildPlayerStep,
  buildResolveAtStep,
  buildProgressModeStep,
  buildResolveValueStep,
  buildLineStep,
  buildOverUnderStep,
  formatPlayerLabel,
  humanizeStatKey,
  sortPlayersByPositionAndName,
  prepareValidPlayers,
  normalizeProgressMode,
  getDefaultProgressPatch,
  type GameContext,
  type StatChoiceOptions,
  type PlayerChoiceOptions,
  type ResolveAtOptions,
  type ProgressModeOptions,
  type ResolveValueOptions,
  type LineOptions,
} from '../../sharedUtils/userConfigBuilder';

import type { PlayerRecord } from '../../../types/modes';
import { getValidPositionsForStat } from './statMappings';
import { filterPlayersByStatPosition as baseFilterPlayersByStatPosition } from '../../sharedUtils/userConfigBuilder';

// ─────────────────────────────────────────────────────────────────────────────
// NFL-Specific Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter players by position based on selected stat (NFL-specific).
 * Uses NFL stat-to-position mappings.
 */
export function filterPlayersByStatPosition(
  players: PlayerRecord[],
  statKey: string | null | undefined,
): PlayerRecord[] {
  return baseFilterPlayersByStatPosition(players, statKey, getValidPositionsForStat);
}
