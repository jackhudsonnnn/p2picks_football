export interface FormatHundredthOptions {
  showPlus?: boolean;
}

export function normalizeToHundredth(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  // Add EPSILON before multiplying to compensate for IEEE-754 representation errors
  // e.g. 1.005 * 100 = 100.49999… → rounds to 100 (wrong). With EPSILON → 100.50… → 101 (correct)
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatToHundredth(value: unknown, options?: FormatHundredthOptions): string {
  const normalized = normalizeToHundredth(value);
  const base = normalized.toFixed(2);
  if (options?.showPlus && normalized > 0) {
    return `+${base}`;
  }
  return base;
}

/**
 * Formats a numeric value to currency with an explicit sign and dollar symbol placed after the sign.
 * Examples: +$12.00, -$3.50, $0.00
 */
export function formatSignedCurrency(value: unknown): string {
  const normalized = normalizeToHundredth(value);
  if (normalized === 0) return '$0.00';
  const sign = normalized > 0 ? '+' : '-';
  const absValue = Math.abs(normalized).toFixed(2);
  return `${sign}$${absValue}`;
}
