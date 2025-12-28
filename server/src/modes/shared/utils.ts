import type { RefinedGameDoc, Team } from '../../utils/refinedDocAccessors';
import type { ModeContext, ModeDefinitionDTO, ModeOverview } from './types';
import type { BetProposal } from '../../supabaseClient';

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

/**
 * Build a ModeContext from config and optional bet.
 */
export function buildModeContext(
  config: Record<string, unknown>,
  bet?: BetProposal | null,
): ModeContext {
  return { config, bet: bet ?? null };
}

/**
 * Default matchup description used by all modes.
 * Returns "{HomeTeam} vs {AwayTeam}" based on config values.
 */
export function getMatchupDescription(ctx: ModeContext): string {
  const { config } = ctx;
  const home = config.home_team_abbrev || config.home_team_name || config.home_team_id || 'Home Team';
  const away = config.away_team_abbrev || config.away_team_name || config.away_team_id || 'Away Team';
  return `${home} vs ${away}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy expression evaluation (deprecated - will be removed)
// ─────────────────────────────────────────────────────────────────────────────

type ModeExpressionContext = {
  config: Record<string, unknown>;
  bet: Record<string, unknown> | null;
  mode: ModeDefinitionDTO | null;
};

function buildLegacyContext(partial: Partial<ModeExpressionContext>): ModeExpressionContext {
  return {
    config: partial.config || {},
    bet: partial.bet ?? null,
    mode: partial.mode ?? null,
  };
}

/** @deprecated Use function-based approach instead */
function evaluateExpression<T = unknown>(expression: string, context: ModeExpressionContext): T | null {
  try {
    const fn = new Function(
      'context',
      'const { config = {}, bet = null, mode = null } = context; return (' + expression + ');',
    );
    return fn(context) as T;
  } catch (err) {
    console.warn('[modeExpressions] evaluation failed', { expression, error: err });
    return null;
  }
}

/** @deprecated Use function-based approach instead */
export function renderModeTemplate(
  template: string | undefined,
  partial: Partial<ModeExpressionContext>,
): string {
  if (!template) return '';
  const context = buildLegacyContext(partial);
  try {
    const fn = new Function(
      'context',
      'const { config = {}, bet = null, mode = null } = context; return ' + template + ';',
    );
    const raw = fn(context);
    if (raw == null) return '';
    return String(raw);
  } catch (err) {
    console.warn('[modeExpressions] template render failed', { template, error: err });
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified API (supports both functions and legacy expressions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run mode config validation.
 * Prefers validateConfig function, falls back to legacy finalizeValidatorExpression.
 */
export function runModeValidator(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string[];
/** @deprecated Use runModeValidator(mode, ctx) instead */
export function runModeValidator(
  expression: string | undefined,
  partial: Partial<ModeExpressionContext>,
): string[];
export function runModeValidator(
  modeOrExpression: ModeDefinitionDTO | string | null | undefined,
  ctxOrPartial: ModeContext | Partial<ModeExpressionContext>,
): string[] {
  // New function-based API: runModeValidator(mode, ctx)
  if (typeof modeOrExpression === 'object' && modeOrExpression !== null && 'key' in modeOrExpression) {
    const mode = modeOrExpression as ModeDefinitionDTO;
    const ctx = ctxOrPartial as ModeContext;
    
    // Prefer function-based validation
    if (mode.validateConfig) {
      try {
        const errors = mode.validateConfig(ctx);
        return Array.isArray(errors) ? errors.filter(e => e.trim().length > 0) : [];
      } catch (err) {
        console.warn('[modeValidator] validateConfig threw', { modeKey: mode.key, error: err });
        return ['Validation error'];
      }
    }
    
    // Fall back to legacy expression
    if (mode.finalizeValidatorExpression) {
      const legacyContext = buildLegacyContext({ config: ctx.config, bet: ctx.bet as Record<string, unknown> | null });
      return runLegacyValidator(mode.finalizeValidatorExpression, legacyContext);
    }
    
    return [];
  }
  
  // Legacy API: runModeValidator(expression, partial)
  const expression = modeOrExpression as string | undefined;
  const partial = ctxOrPartial as Partial<ModeExpressionContext>;
  if (!expression) return [];
  const context = buildLegacyContext(partial);
  return runLegacyValidator(expression, context);
}

function runLegacyValidator(expression: string, context: ModeExpressionContext): string[] {
  const result = evaluateExpression<unknown>(expression, context);
  if (Array.isArray(result)) {
    return result
      .map((item) => String(item))
      .filter((item) => item.trim().length > 0);
  }
  if (result == null || result === true) return [];
  if (result === false) return ['Invalid configuration'];
  return [String(result)];
}

/**
 * Compute available betting options for a mode.
 * Prefers computeOptions function, falls back to legacy optionsExpression.
 */
export function computeModeOptions(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string[];
/** @deprecated Use computeModeOptions(mode, ctx) instead */
export function computeModeOptions(
  mode: ModeDefinitionDTO | null | undefined,
  partial: Partial<ModeExpressionContext>,
): string[];
export function computeModeOptions(
  mode: ModeDefinitionDTO | null | undefined,
  ctxOrPartial: ModeContext | Partial<ModeExpressionContext>,
): string[] {
  const debug = process.env.DEBUG_MODE_OPTIONS === '1' || process.env.DEBUG_MODE_OPTIONS === 'true';
  
  if (!mode) {
    if (debug) {
      console.log('[modeOptions] no mode definition provided, defaulting to pass option');
    }
    return ['pass'];
  }
  
  const modeKey = mode.key || 'unknown';
  
  // Check for static options first
  if (mode.staticOptions && mode.staticOptions.length > 0) {
    const options = ensurePassOption(dedupeOptions(mode.staticOptions));
    if (debug) {
      console.log('[modeOptions] using static options', { modeKey, options });
    }
    return options;
  }
  
  // Prefer function-based computeOptions
  if (mode.computeOptions) {
    const ctx: ModeContext = 'bet' in ctxOrPartial && ctxOrPartial.bet !== undefined
      ? ctxOrPartial as ModeContext
      : { config: ctxOrPartial.config || {}, bet: (ctxOrPartial as Partial<ModeExpressionContext>).bet as BetProposal | null ?? null };
    
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
  
  // Fall back to legacy optionsExpression
  if (mode.optionsExpression) {
    const context = buildLegacyContext(ctxOrPartial as Partial<ModeExpressionContext>);
    const result = evaluateExpression<unknown>(mode.optionsExpression, context);
    if (debug) {
      console.log('[modeOptions] expression evaluated', { modeKey, result });
    }
    if (Array.isArray(result)) {
      const options = result
        .map((item) => String(item))
        .filter((item) => item.trim().length > 0);
      const finalOptions = ensurePassOption(dedupeOptions(options));
      if (debug) {
        console.log('[modeOptions] expression produced options', { modeKey, finalOptions });
      }
      if (finalOptions.length <= 1) {
        console.warn('[modeOptions] expression produced no user options beyond pass', {
          modeKey,
          expression: mode.optionsExpression,
          config: context.config,
        });
      }
      return finalOptions;
    }
    console.warn('[modeOptions] optionsExpression did not return an array', {
      modeKey,
      expression: mode.optionsExpression,
      result,
      config: context.config,
    });
  }
  
  if (debug) {
    console.log('[modeOptions] falling back to default pass option', { modeKey });
  }
  return ensurePassOption(['pass']);
}

/**
 * Compute winning condition description.
 * Prefers computeWinningCondition function, falls back to legacy winningConditionTemplate.
 */
export function computeWinningCondition(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string {
  if (!mode) return '';
  
  // Prefer function-based computeWinningCondition
  if (mode.computeWinningCondition) {
    try {
      return mode.computeWinningCondition(ctx) || '';
    } catch (err) {
      console.warn('[modeWinningCondition] computeWinningCondition threw', { modeKey: mode.key, error: err });
      return '';
    }
  }
  
  // Fall back to legacy winningConditionTemplate
  if (mode.winningConditionTemplate) {
    const legacyContext = buildLegacyContext({ 
      config: ctx.config, 
      bet: ctx.bet as Record<string, unknown> | null,
      mode 
    });
    return renderModeTemplate(mode.winningConditionTemplate, legacyContext);
  }
  
  return '';
}

/**
 * Compute matchup description.
 * Uses the shared getMatchupDescription helper (all modes use same format).
 */
export function computeMatchupDescription(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string {
  // Always use the standard matchup format
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

export function listTeams(doc: RefinedGameDoc | null | undefined): Team[] {
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams as Team[];
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
