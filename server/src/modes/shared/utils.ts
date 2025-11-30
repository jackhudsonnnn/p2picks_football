import type { RefinedGameDoc, Team } from '../../utils/gameData';
import type { ModeDefinitionDTO, ModeOverview } from './types';

export function cloneDefinition(definition: ModeDefinitionDTO): ModeDefinitionDTO {
  return JSON.parse(JSON.stringify(definition));
}

export function cloneOverview(overview: ModeOverview): ModeOverview {
  return JSON.parse(JSON.stringify(overview));
}

type ModeExpressionContext = {
  config: Record<string, unknown>;
  bet: Record<string, unknown> | null;
  mode: ModeDefinitionDTO | null;
};

function buildContext(partial: Partial<ModeExpressionContext>): ModeExpressionContext {
  return {
    config: partial.config || {},
    bet: partial.bet ?? null,
    mode: partial.mode ?? null,
  };
}

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

export function renderModeTemplate(
  template: string | undefined,
  partial: Partial<ModeExpressionContext>,
): string {
  if (!template) return '';
  const context = buildContext(partial);
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

export function runModeValidator(
  expression: string | undefined,
  partial: Partial<ModeExpressionContext>,
): string[] {
  if (!expression) return [];
  const context = buildContext(partial);
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

export function computeModeOptions(
  mode: ModeDefinitionDTO | null | undefined,
  partial: Partial<ModeExpressionContext>,
): string[] {
  const debug = process.env.DEBUG_MODE_OPTIONS === '1' || process.env.DEBUG_MODE_OPTIONS === 'true';
  if (!mode) {
    if (debug) {
      console.log('[modeOptions] no mode definition provided, defaulting to pass option');
    }
    return ['pass'];
  }
  const context = buildContext(partial);
  const modeKey = mode.key || 'unknown';
  if (debug) {
    console.log('[modeOptions] computing options', {
      modeKey,
      hasStaticOptions: Array.isArray(mode.staticOptions) && mode.staticOptions.length > 0,
      hasOptionsExpression: Boolean(mode.optionsExpression),
      config: context.config,
      betId: context.bet && 'bet_id' in context.bet ? (context.bet as Record<string, unknown>).bet_id : null,
    });
  }
  if (mode.staticOptions && mode.staticOptions.length > 0) {
    const options = ensurePassOption(dedupeOptions(mode.staticOptions));
    if (debug) {
      console.log('[modeOptions] using static options', { modeKey, options });
    }
    return options;
  }
  if (mode.optionsExpression) {
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

function isTeamSide(team: Team, side: 'home' | 'away'): boolean {
  const homeAway = (team as any)?.homeAway;
  if (homeAway === undefined || homeAway === null) return false;
  return String(homeAway).trim().toLowerCase() === side;
}
