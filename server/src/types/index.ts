/**
 * Types barrel export
 */

// League types
export { LEAGUES, normalizeLeague, type League } from './league';

// Mode system types
export type {
  // Core types
  PlayerRecord,
  ModeUserConfigInputType,
  ModeContext,
  // Definition types
  ModeConfigStepDefinition,
  ModeDefinitionDTO,
  // Overview types
  ModeOverviewExample,
  ModeOverview,
  // User config types
  ModeUserConfigChoice,
  ModeUserConfigStep,
  // Validator types
  ModeValidator,
  // Live info types
  ModeLiveInfo,
  GetLiveInfoInput,
  // Build user config types
  BuildUserConfigInput,
  // Validation types
  ValidateProposalInput,
  ValidateProposalResult,
  // Module types
  ModeModule,
  LeagueModeModule,
  // Registry types
  ModeRegistryEntry,
  ModeLookupResult,
} from './modes';
