import type { ModeDefinitionDTO, ModeOverview } from '../modes/shared/types';
import { getModeDefinition, getModeOverview, listModeDefinitions, listModeOverviews } from '../modes/registry';

export function listModeCatalog(): ModeDefinitionDTO[] {
  return listModeDefinitions();
}

export function listModeOverviewCatalog(): ModeOverview[] {
  return listModeOverviews();
}

export function findModeDefinition(modeKey: string): ModeDefinitionDTO | null {
  return getModeDefinition(modeKey);
}

export function findModeOverview(modeKey: string): ModeOverview | null {
  return getModeOverview(modeKey);
}

export function requireModeDefinition(modeKey: string): ModeDefinitionDTO {
  const definition = findModeDefinition(modeKey);
  if (!definition) {
    throw new Error(`mode ${modeKey} not found`);
  }
  return definition;
}

export function requireModeOverview(modeKey: string): ModeOverview {
  const overview = findModeOverview(modeKey);
  if (!overview) {
    throw new Error(`mode ${modeKey} not found`);
  }
  return overview;
}
