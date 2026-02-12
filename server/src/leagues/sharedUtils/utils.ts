import type { ModeContext, ModeDefinitionDTO } from './types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('modeUtils');

export function computeModeOptions(
  mode: ModeDefinitionDTO | null | undefined,
  ctx: ModeContext,
): string[] {  
  if (!mode) {
    return ['No Entry'];
  }
  
  const modeKey = mode.key || 'unknown';
  
  if (mode.staticOptions && mode.staticOptions.length > 0) {
    const options = ensureNoEntryOption(dedupeOptions(mode.staticOptions));
    return options;
  }
  
  if (mode.computeOptions) {
    try {
      const result = mode.computeOptions(ctx);
      if (Array.isArray(result)) {
        const options = result
          .map((item) => String(item))
          .filter((item) => item.trim().length > 0);
        const finalOptions = ensureNoEntryOption(dedupeOptions(options));
        return finalOptions;
      }
    } catch (err) {
      logger.warn({ modeKey, error: err }, 'computeOptions threw');
    }
  }
  
  return ensureNoEntryOption(['No Entry']);
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
      logger.warn({ modeKey: mode.key, error: err }, 'computeWinningCondition threw');
      return '';
    }
  }
  
  return '';
}

function ensureNoEntryOption(options: string[]): string[] {
  if (!options.includes('No Entry')) {
    return ['No Entry', ...options];
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
