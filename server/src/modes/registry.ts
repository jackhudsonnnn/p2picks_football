import type { BetProposal } from '../supabaseClient';
import type { ModeDefinitionDTO, ModeModule } from './shared/types';
import { cloneDefinition } from './shared/utils';
import { MODE_MODULES } from './modules';

export function listModeDefinitions(): ModeDefinitionDTO[] {
  return MODE_MODULES.map((module) => cloneDefinition(module.definition));
}

export function getModeDefinition(modeKey: string): ModeDefinitionDTO | null {
  const module = findModeModule(modeKey);
  return module ? cloneDefinition(module.definition) : null;
}

export async function prepareModeConfigPayload(
  modeKey: string,
  bet: BetProposal,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const module = findModeModule(modeKey);
  if (!module || !module.prepareConfig) {
    return config;
  }
  return module.prepareConfig({ bet, config });
}

function findModeModule(modeKey: string): ModeModule | undefined {
  return MODE_MODULES.find((module) => module.definition.key === modeKey);
}

export function getModeModule(modeKey: string): ModeModule | undefined {
  return findModeModule(modeKey);
}
