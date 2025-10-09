import type { ModeDefinitionDTO } from './types';

export function cloneDefinition(definition: ModeDefinitionDTO): ModeDefinitionDTO {
  return JSON.parse(JSON.stringify(definition));
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
  if (!mode) return ['pass'];
  if (mode.staticOptions && mode.staticOptions.length > 0) {
    return ensurePassOption(dedupeOptions(mode.staticOptions));
  }
  if (mode.optionsExpression) {
    const context = buildContext(partial);
    const result = evaluateExpression<unknown>(mode.optionsExpression, context);
    if (Array.isArray(result)) {
      const options = result
        .map((item) => String(item))
        .filter((item) => item.trim().length > 0);
      return ensurePassOption(dedupeOptions(options));
    }
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
