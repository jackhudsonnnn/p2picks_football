import type { ModeUserConfigStep } from '../../shared/types';

/**
 * Choose Their Fate currently derives all configuration from the active drive context,
 * so there are no user-configurable steps. We still expose a builder for parity with
 * other modes and future extensibility.
 */
export async function buildChooseTheirFateUserConfig(): Promise<ModeUserConfigStep[]> {
  return [];
}
