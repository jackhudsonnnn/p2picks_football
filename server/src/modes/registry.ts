import type { BetProposal } from '../supabaseClient';
import type { ModeDefinitionDTO, ModeModule, ModeOverview } from './shared/types';
import { cloneDefinition, cloneOverview } from './shared/utils';
import { MODE_MODULES } from './modules';

const MODE_MODULE_REGISTRY = buildRegistry(MODE_MODULES);

export function listModeDefinitions(): ModeDefinitionDTO[] {
  return Array.from(MODE_MODULE_REGISTRY.values()).map((module) => cloneDefinition(module.definition));
}

export function listModeOverviews(): ModeOverview[] {
  return Array.from(MODE_MODULE_REGISTRY.values())
    .filter((module) => Boolean(module.overview))
    .map((module) => cloneOverview(module.overview!));
}

export function getModeDefinition(modeKey: string): ModeDefinitionDTO | null {
  const module = findModeModule(modeKey);
  return module ? cloneDefinition(module.definition) : null;
}

export function getModeOverview(modeKey: string): ModeOverview | null {
  const module = findModeModule(modeKey);
  if (!module?.overview) return null;
  return cloneOverview(module.overview);
}

export async function prepareModeConfigPayload(
  modeKey: string,
  bet: BetProposal,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const module = findModeModule(modeKey);
  if (!module || !module.prepareConfig) {
    if (!module) {
      console.warn('[modes] prepareModeConfigPayload missing module', { modeKey });
    }
    return config;
  }
  return module.prepareConfig({ bet, config });
}

function findModeModule(modeKey: string): ModeModule | undefined {
  return MODE_MODULE_REGISTRY.get(modeKey);
}

export function getModeModule(modeKey: string): ModeModule | undefined {
  return findModeModule(modeKey);
}

function buildRegistry(modules: ModeModule[]): Map<string, ModeModule> {
  const registry = new Map<string, ModeModule>();
  for (const module of modules) {
    const key = module.definition?.key;
    if (!key) {
      throw new Error('[modes] encountered module without a definition key');
    }
    if (registry.has(key)) {
      throw new Error(`[modes] duplicate module key detected: ${key}`);
    }
    registry.set(key, module);
  }
  return registry;
}
