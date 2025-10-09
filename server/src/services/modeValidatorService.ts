import { MODE_MODULES } from '../modes/modules';
import type { ModeValidator } from '../modes/shared/types';

const activeValidators: ModeValidator[] = [];
let started = false;

export function startModeValidators(): void {
  if (started) return;
  started = true;
  for (const module of MODE_MODULES) {
    if (!module.validator) continue;
    try {
      module.validator.start();
      activeValidators.push(module.validator);
    } catch (err) {
      console.error('[modeValidatorService] failed to start validator', {
        mode_key: module.definition.key,
        error: (err as Error).message,
      });
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
  started = false;
}
