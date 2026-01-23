import { MODE_MODULES } from '../../nfl_modes/modules';
import type { ModeValidator } from '../../nfl_modes/shared/types';
import { startNflGameFeedService, stopNflGameFeedService } from '../nflData/nflGameFeedService';

const activeValidators: ModeValidator[] = [];
let started = false;

export function startModeValidators(): void {
  if (started) return;
  started = true;
  startNflGameFeedService();
  for (const module of MODE_MODULES) {
    if (!module.validator) continue;
    try {
      module.validator.start();
      activeValidators.push(module.validator);
    } catch (err) {
      console.error('[modeValidatorService] failed to start validator', {
        mode_key: module.definition.key,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

export function stopModeValidators(): void {
  if (!started) return;
  while (activeValidators.length) {
    const validator = activeValidators.pop();
    if (!validator) continue;
    try {
      validator.stop();
    } catch (err) {
      console.error('[modeValidatorService] failed to stop validator', (err as Error).message);
    }
  }
  stopNflGameFeedService();
  started = false;
}
