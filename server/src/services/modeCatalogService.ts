import type { ModeDefinitionDTO } from '../modes/shared/types';
import { getModeDefinition, listModeDefinitions } from '../modes/registry';

export function listModeCatalog(): ModeDefinitionDTO[] {
  return listModeDefinitions();
}

export function findModeDefinition(modeKey: string): ModeDefinitionDTO | null {
  return getModeDefinition(modeKey);
}

export function requireModeDefinition(modeKey: string): ModeDefinitionDTO {
  const definition = findModeDefinition(modeKey);
  if (!definition) {
    throw new Error(`mode ${modeKey} not found`);
  }
  return definition;
}
