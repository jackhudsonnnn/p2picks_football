/**
 * Round a number to the nearest hundredth (2 decimal places).
 *
 * Uses Number.EPSILON compensation to avoid IEEE-754 rounding artifacts.
 * Example: Math.round(1.005 * 100) / 100 = 1.00 (wrong!)
 *          Math.round((1.005 + Number.EPSILON) * 100) / 100 = 1.01 (correct)
 */
export function normalizeToHundredth(value: number): number {
  const num = Number(value) || 0;
  if (!Number.isFinite(num)) return 0;
  // Add EPSILON before multiplying to compensate for floating-point representation errors
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  // Eliminate negative zero
  return rounded === 0 ? 0 : rounded;
}

/**
 * Normalize any value to a number, with a fallback default.
 */
export function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
}

/**
 * Format a number for display (e.g., "1" or "1.5").
 */
export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  const fractional = Math.abs(value % 1) > 1e-9;
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractional ? 1 : 0,
    maximumFractionDigits: fractional ? 1 : 0,
  });
  return formatter.format(value);
}

/**
 * Check if two numbers are approximately equal within an epsilon.
 */
export function isApproximatelyEqual(a: number, b: number, epsilon = 1e-9): boolean {
  return Math.abs(a - b) < epsilon;
}
