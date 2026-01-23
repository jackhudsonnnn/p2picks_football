/**
 * Modes Module
 * 
 * Unified entry point for the mode registry system.
 * Re-exports all registry functions and types for external use.
 */

// Types
export type {
  LeagueModeModule,
  ModeRegistryEntry,
  ModeLookupResult,
  ModeDefinitionDTO,
  ModeOverview,
  ModeContext,
  ModeConfigStepDefinition,
  ModeUserConfigChoice,
  ModeUserConfigStep,
  ModeValidator,
  ModeLiveInfo,
  GetLiveInfoInput,
  BuildUserConfigInput,
  ValidateProposalInput,
  ValidateProposalResult,
} from './types';

// Registry functions
export {
  registerMode,
  registerModes,
  clearRegistry,
  modeSupportsLeague,
  getMode,
  getModeOrThrow,
  listModeKeys,
  listModesForLeague,
  listAllModes,
  getModeSupportedLeagues,
  getActiveLeagues,
  isLeagueActive,
  listModeDefinitions,
  listModeOverviews,
  getModeDefinition,
  prepareModeConfig,
  buildModeUserConfig,
  validateModeProposal,
  getModeLiveInfo,
  initializeRegistry,
  ensureInitialized,
} from './registry';
