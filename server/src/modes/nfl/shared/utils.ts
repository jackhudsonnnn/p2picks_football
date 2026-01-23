import type { ModeContext, ModeDefinitionDTO } from './types';
import type { BetProposal } from '../../../supabaseClient';

export function normalizeStatus(raw: string | null | undefined): string {
  return raw ? String(raw).trim().toUpperCase() : '';
}

export function buildModeContext(
  config: Record<string, unknown>,
  bet?: BetProposal | null,
): ModeContext {
  return { config, bet: bet ?? null };
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
  if (!mode) {
    return ['pass'];
  }
  
  const modeKey = mode.key || 'unknown';
  
  if (mode.staticOptions && mode.staticOptions.length > 0) {
    const options = ensurePassOption(dedupeOptions(mode.staticOptions));
    return options;
  }
  
  if (mode.computeOptions) {
    try {
      const result = mode.computeOptions(ctx);
      if (Array.isArray(result)) {
        const options = result
          .map((item) => String(item))
          .filter((item) => item.trim().length > 0);
        const finalOptions = ensurePassOption(dedupeOptions(options));
        return finalOptions;
      }
    } catch (err) {
      console.warn('[modeOptions] computeOptions threw', { modeKey, error: err });
    }
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
