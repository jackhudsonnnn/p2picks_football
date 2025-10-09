export function normalizeToHundredth(value: number): number {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isFinite(rounded) ? rounded : 0;
}
