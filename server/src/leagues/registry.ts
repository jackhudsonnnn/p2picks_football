/**
 * Unified Mode Registry
 * 
 * Central registry for all betting modes across all leagues.
 * Provides routing logic to find appropriate mode handlers based on
 * mode key and league.
 * 
 * Architecture:
 * - Modes declare which leagues they support via `supportedLeagues`
 * - Registry indexes modes by key for fast lookup
 * - Routing functions validate league compatibility before returning handlers
 */

import type { BetProposal } from '../supabaseClient';
import type { League } from '../types/league';
import { LEAGUES } from '../types/league';
import type {
  LeagueModeModule,
  ModeRegistryEntry,
  ModeLookupResult,
  ModeDefinitionDTO,
  ModeOverview,
  GetLiveInfoInput,
  ModeLiveInfo,
  BuildUserConfigInput,
  ModeUserConfigStep,
  ValidateProposalInput,
  ValidateProposalResult,
} from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('ModeRegistry');

// ─────────────────────────────────────────────────────────────────────────────
// Registry State
// ─────────────────────────────────────────────────────────────────────────────

const registry = new Map<string, ModeRegistryEntry>();
let initialized = false;

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a mode module in the unified registry.
 * Validates the module and indexes it for fast lookup.
 */
export function registerMode(module: LeagueModeModule): void {
  const key = module.key;
  
  if (!key) {
    throw new Error('[ModeRegistry] Cannot register module without a key');
  }
  
  if (registry.has(key)) {
    logger.warn({ modeKey: key }, `Overwriting existing module: ${key}`);
  }

  // Build league set for fast lookup
  let leagueSet: Set<League> | 'all';
  if (Array.isArray(module.supportedLeagues) && module.supportedLeagues[0] === '*') {
    leagueSet = 'all';
  } else {
    leagueSet = new Set(module.supportedLeagues as League[]);
  }

  registry.set(key, { module, leagueSet });
  logger.info({ modeKey: key, leagues: leagueSet === 'all' ? 'all' : Array.from(leagueSet) }, `Registered mode: ${key}`);
}

/**
 * Register multiple mode modules at once.
 */
export function registerModes(modules: LeagueModeModule[]): void {
  for (const module of modules) {
    registerMode(module);
  }
}

/**
 * Clear the registry (useful for testing).
 */
export function clearRegistry(): void {
  registry.clear();
  initialized = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup & Routing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a mode supports a specific league.
 */
export function modeSupportsLeague(modeKey: string, league: League): boolean {
  const entry = registry.get(modeKey);
  if (!entry) return false;
  if (entry.leagueSet === 'all') return true;
  return entry.leagueSet.has(league);
}

/**
 * Get a mode module by key, optionally validating league support.
 */
export function getMode(modeKey: string, league?: League): ModeLookupResult {
  const entry = registry.get(modeKey);
  
  if (!entry) {
    return { found: false, reason: 'not_found' };
  }

  if (league !== undefined) {
    const supportsLeague = entry.leagueSet === 'all' || entry.leagueSet.has(league);
    if (!supportsLeague) {
      return { found: false, reason: 'league_not_supported' };
    }
  }

  return { found: true, module: entry.module };
}

/**
 * Get a mode module by key (throws if not found).
 */
export function getModeOrThrow(modeKey: string, league?: League): LeagueModeModule {
  const result = getMode(modeKey, league);
  if (!result.found) {
    if (result.reason === 'league_not_supported') {
      throw new Error(`Mode '${modeKey}' does not support league '${league}'`);
    }
    throw new Error(`Mode '${modeKey}' not found in registry`);
  }
  return result.module!;
}

/**
 * List all registered mode keys.
 */
export function listModeKeys(): string[] {
  return Array.from(registry.keys());
}

/**
 * List modes available for a specific league.
 */
export function listModesForLeague(league: League): LeagueModeModule[] {
  const modes: LeagueModeModule[] = [];
  for (const entry of registry.values()) {
    if (entry.leagueSet === 'all' || entry.leagueSet.has(league)) {
      modes.push(entry.module);
    }
  }
  return modes;
}

/**
 * List all registered modes.
 */
export function listAllModes(): LeagueModeModule[] {
  return Array.from(registry.values()).map(entry => entry.module);
}

/**
 * Get the leagues supported by a mode.
 */
export function getModeSupportedLeagues(modeKey: string): League[] | null {
  const entry = registry.get(modeKey);
  if (!entry) return null;
  if (entry.leagueSet === 'all') return [...LEAGUES];
  return Array.from(entry.leagueSet);
}

/**
 * Get all leagues that have at least one registered mode.
 * Use this to dynamically determine which league data feeds to start.
 * 
 * If any mode supports all leagues ('*'), returns all known leagues.
 */
export function getActiveLeagues(): League[] {
  const activeLeagues = new Set<League>();
  
  for (const entry of registry.values()) {
    if (entry.leagueSet === 'all') {
      // A mode supports all leagues, so all leagues are active
      return [...LEAGUES];
    }
    for (const league of entry.leagueSet) {
      activeLeagues.add(league);
    }
  }
  
  return Array.from(activeLeagues);
}

/**
 * Check if a specific league has any registered modes.
 */
export function isLeagueActive(league: League): boolean {
  for (const entry of registry.values()) {
    if (entry.leagueSet === 'all' || entry.leagueSet.has(league)) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode Operations (Routed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List mode definitions, optionally filtered by league.
 * Includes supportedLeagues in metadata for client-side filtering.
 */
export function listModeDefinitions(league?: League): ModeDefinitionDTO[] {
  const modes = league ? listModesForLeague(league) : listAllModes();
  return modes.map(m => cloneDefinitionWithLeagues(m));
}

/**
 * List mode overviews, optionally filtered by league.
 */
export function listModeOverviews(league?: League): ModeOverview[] {
  const modes = league ? listModesForLeague(league) : listAllModes();
  return modes
    .filter(m => Boolean(m.overview))
    .map(m => cloneOverview(m.overview!));
}

/**
 * Get a mode definition by key.
 */
export function getModeDefinition(modeKey: string, league?: League): ModeDefinitionDTO | null {
  const result = getMode(modeKey, league);
  if (!result.found) return null;
  return cloneDefinition(result.module!.definition);
}

/**
 * Prepare mode config payload before bet creation.
 */
export async function prepareModeConfig(
  modeKey: string,
  bet: BetProposal,
  config: Record<string, unknown>,
  league: League,
): Promise<Record<string, unknown>> {
  const result = getMode(modeKey, league);
  if (!result.found || !result.module!.prepareConfig) {
    if (!result.found) {
      logger.warn({ modeKey, league }, 'prepareModeConfig: mode not found or not supported');
    }
    return config;
  }
  return result.module!.prepareConfig({ bet, config, league });
}

/**
 * Build user config steps for the proposer UI.
 */
export async function buildModeUserConfig(
  modeKey: string,
  input: BuildUserConfigInput,
): Promise<ModeUserConfigStep[]> {
  const { league } = input;
  const result = getMode(modeKey, league);
  if (!result.found || !result.module!.buildUserConfig) {
    return [];
  }
  return result.module!.buildUserConfig(input);
}

/**
 * Validate a bet proposal.
 */
export async function validateModeProposal(
  modeKey: string,
  input: ValidateProposalInput,
): Promise<ValidateProposalResult> {
  const { league } = input;
  const result = getMode(modeKey, league);
  if (!result.found) {
    return {
      valid: false,
      error: result.reason === 'league_not_supported' 
        ? `Mode '${modeKey}' is not available for ${league}`
        : `Unknown mode: ${modeKey}`,
    };
  }
  if (!result.module!.validateProposal) {
    return { valid: true };
  }
  return result.module!.validateProposal(input);
}

/**
 * Get live info for a bet.
 */
export async function getModeLiveInfo(
  modeKey: string,
  input: GetLiveInfoInput,
): Promise<ModeLiveInfo | null> {
  const result = getMode(modeKey, input.league);
  if (!result.found || !result.module!.getLiveInfo) {
    return null;
  }
  return result.module!.getLiveInfo(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloning Utilities
// ─────────────────────────────────────────────────────────────────────────────

function cloneDefinition(definition: ModeDefinitionDTO): ModeDefinitionDTO {
  return {
    ...definition,
    configSteps: definition.configSteps.map(step => ({ ...step })),
    metadata: definition.metadata ? { ...definition.metadata } : undefined,
  };
}

/**
 * Clone a definition and include supportedLeagues in metadata.
 * This allows the client to filter modes by league.
 */
function cloneDefinitionWithLeagues(module: LeagueModeModule): ModeDefinitionDTO {
  const definition = cloneDefinition(module.definition);
  const supportedLeagues = module.supportedLeagues[0] === '*' 
    ? [...LEAGUES] 
    : [...module.supportedLeagues as League[]];
  
  return {
    ...definition,
    metadata: {
      ...definition.metadata,
      supportedLeagues,
    },
  };
}

function cloneOverview(overview: ModeOverview): ModeOverview {
  return JSON.parse(JSON.stringify(overview));
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the registry with default modes.
 * Called automatically on first use, or can be called explicitly.
 */
export async function initializeRegistry(): Promise<void> {
  if (initialized) return;
  
  // Import and register NFL modes
  const { MODE_MODULES: nflModes } = await import('./nfl/modules');
  registerModes(nflModes);
  
  // Import and register NBA modes
  const { NBA_MODE_MODULES: nbaModes } = await import('./nba/modules');
  registerModes(nbaModes);
  
  // Import and register U2Pick modes
  const { U2PICK_MODE_MODULES: u2pickModes } = await import('./u2pick/modules');
  registerModes(u2pickModes);
  
  // Future: Import and register MLB, NHL, etc. modes here
  
  initialized = true;
  logger.info({ modeCount: registry.size }, `Initialized with ${registry.size} modes`);
}

/**
 * Ensure registry is initialized before use.
 */
export async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await initializeRegistry();
  }
}
