import type { RefinedGameDoc, Team } from '../../services/nflData/nflRefinedDataAccessors';
import type { ModeContext, ModeDefinitionDTO, ModeOverview } from './types';
import type { BetProposal } from '../../supabaseClient';
import { listTeams } from './teamUtils';

export function normalizeStatus(raw: string | null | undefined): string {
  return raw ? String(raw).trim().toUpperCase() : '';
}

export function cloneDefinition(definition: ModeDefinitionDTO): ModeDefinitionDTO {
  return {
    ...definition,
    configSteps: definition.configSteps.map((step) => ({ ...step })),
    metadata: definition.metadata ? { ...definition.metadata } : undefined,
  };
}

export function cloneOverview(overview: ModeOverview): ModeOverview {
  return JSON.parse(JSON.stringify(overview));
}

export function buildModeContext(
  config: Record<string, unknown>,
  bet?: BetProposal | null,
): ModeContext {
  return { config, bet: bet ?? null };
}

export function getMatchupDescription(ctx: ModeContext): string {
  const { config } = ctx;
  const home = config.home_team_abbrev || config.home_team_name || 'Home Team';
  const away = config.away_team_abbrev || config.away_team_name || 'Away Team';
  return `${home} vs ${away}`;
}

export function runModeValidator(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string[] {
  if (!mode) return [];
  if (mode.validateConfig) {
    try {
      const errors = mode.validateConfig(ctx);
      return Array.isArray(errors) ? errors.filter((e) => e.trim().length > 0) : [];
    } catch (err) {
      console.warn('[modeValidator] validateConfig threw', { modeKey: mode.key, error: err });
      return ['Validation error'];
    }
  }

  return [];
}

export function computeModeOptions(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string[] {
  const debug = process.env.DEBUG_MODE_OPTIONS === '1' || process.env.DEBUG_MODE_OPTIONS === 'true';
  
  if (!mode) {
    if (debug) {
      console.log('[modeOptions] no mode definition provided, defaulting to pass option');
    }
    return ['pass'];
  }
  
  const modeKey = mode.key || 'unknown';
  
  if (mode.staticOptions && mode.staticOptions.length > 0) {
    const options = ensurePassOption(dedupeOptions(mode.staticOptions));
    if (debug) {
      console.log('[modeOptions] using static options', { modeKey, options });
    }
    return options;
  }
  
  if (mode.computeOptions) {
    try {
      const result = mode.computeOptions(ctx);
      if (debug) {
        console.log('[modeOptions] computeOptions called', { modeKey, result });
      }
      if (Array.isArray(result)) {
        const options = result
          .map((item) => String(item))
          .filter((item) => item.trim().length > 0);
        const finalOptions = ensurePassOption(dedupeOptions(options));
        if (debug) {
          console.log('[modeOptions] computeOptions produced options', { modeKey, finalOptions });
        }
        return finalOptions;
      }
    } catch (err) {
      console.warn('[modeOptions] computeOptions threw', { modeKey, error: err });
    }
  }
  
  if (debug) {
    console.log('[modeOptions] falling back to default pass option', { modeKey });
  }
  return ensurePassOption(['pass']);
}

export function computeWinningCondition(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string {
  if (!mode) return '';
  if (mode.computeWinningCondition) {
    try {
      return mode.computeWinningCondition(ctx) || '';
    } catch (err) {
      console.warn('[modeWinningCondition] computeWinningCondition threw', { modeKey: mode.key, error: err });
      return '';
    }
  }
  
  return '';
}

export function computeMatchupDescription(
  ctx: ModeContext,
): string {
  return getMatchupDescription(ctx);
}

function ensurePassOption(options: string[]): string[] {
  if (!options.includes('pass')) {
    return ['pass', ...options];
  }
  return options;
}

function dedupeOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  options.forEach((option) => {
    const value = option.trim();
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

export function pickHomeTeam(doc: RefinedGameDoc | null | undefined): Team | null {
  const teams = listTeams(doc);
  if (teams.length === 0) return null;
  return teams.find((team) => isTeamSide(team, 'home')) ?? teams[0] ?? null;
}

export function pickAwayTeam(doc: RefinedGameDoc | null | undefined, homeTeam?: Team | null): Team | null {
  const teams = listTeams(doc);
  if (teams.length === 0) return null;
  const flagged = teams.find((team) => isTeamSide(team, 'away'));
  if (flagged) return flagged;
  if (homeTeam) {
    const fallback = teams.find((team) => team !== homeTeam);
    if (fallback) return fallback;
  }
  return teams.length > 1 ? teams[1] : null;
}

export function extractTeamId(team: Team | null | undefined): string | null {
  if (!team) return null;
  const raw = (team as any)?.teamId ?? (team as any)?.abbreviation ?? (team as any)?.id;
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value.length ? value : null;
}

export function extractTeamName(team: Team | null | undefined): string | null {
  if (!team) return null;
  const raw = (team as any)?.name ?? (team as any)?.abbreviation ?? (team as any)?.teamId;
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value.length ? value : null;
}

export function extractTeamAbbreviation(team: Team | null | undefined): string | null {
  if (!team) return null;
  const raw = (team as any)?.abbreviation ?? (team as any)?.name ?? (team as any)?.teamId;
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value.length ? value : null;
}

function isTeamSide(team: Team, side: 'home' | 'away'): boolean {
  const homeAway = (team as any)?.homeAway;
  if (homeAway === undefined || homeAway === null) return false;
  return String(homeAway).trim().toLowerCase() === side;
}
