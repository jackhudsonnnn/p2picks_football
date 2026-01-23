import type { BuildUserConfigInput, ModeUserConfigStep } from '../../shared/types';

/**
 * Score Sorcerer does not require additional user-driven configuration beyond the
 * selected game. Expose a builder for consistency and future options (e.g.,
 * toggling "No More Scores" availability).
 */
export async function buildScoreSorcererUserConfig(_input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  return [];
}
