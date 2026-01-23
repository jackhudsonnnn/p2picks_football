import type { BuildUserConfigInput, ModeUserConfigStep } from '../../../types';

/**
 * NBA Score Sorcerer does not require additional user-driven configuration beyond the
 * selected game.
 */
export async function buildNbaScoreSorcererUserConfig(_input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  return [];
}
