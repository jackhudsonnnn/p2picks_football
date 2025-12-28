import type { RefinedGameDoc } from '../../utils/refinedDocAccessors';

export function shouldSkipResolveStep(doc: RefinedGameDoc | null | undefined): boolean {
  if (!doc) return false;
  const status = typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  if (status === 'STATUS_HALFTIME') return true;
  if (typeof doc.period === 'number' && Number.isFinite(doc.period) && doc.period >= 3) return true;
  return false;
}

export function normalizeResolveAt(
  value: unknown,
  allowedValues: readonly string[],
  fallback: string,
): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && allowedValues.includes(trimmed)) {
      return trimmed;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const numeric = String(value);
    if (allowedValues.includes(numeric)) {
      return numeric;
    }
  }
  return fallback;
}
