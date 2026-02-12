import { describe, it, expect } from 'vitest';
import { normalizeToHundredth, formatToHundredth, formatSignedCurrency } from './number';

// ---------------------------------------------------------------------------
// normalizeToHundredth
// ---------------------------------------------------------------------------
describe('normalizeToHundredth', () => {
  it('rounds to two decimal places', () => {
    expect(normalizeToHundredth(1.006)).toBe(1.01);
    expect(normalizeToHundredth(1.004)).toBe(1);
    expect(normalizeToHundredth(2.999)).toBe(3);
  });

  it('coerces string numbers', () => {
    expect(normalizeToHundredth('3.14159')).toBe(3.14);
    expect(normalizeToHundredth('0')).toBe(0);
  });

  it('returns 0 for null / undefined / NaN / non-numeric', () => {
    expect(normalizeToHundredth(null)).toBe(0);
    expect(normalizeToHundredth(undefined)).toBe(0);
    expect(normalizeToHundredth(NaN)).toBe(0);
    expect(normalizeToHundredth('abc')).toBe(0);
    expect(normalizeToHundredth(Infinity)).toBe(0);
    expect(normalizeToHundredth(-Infinity)).toBe(0);
  });

  it('eliminates negative zero', () => {
    expect(Object.is(normalizeToHundredth(-0.001), 0)).toBe(true);
  });

  it('handles negative numbers', () => {
    expect(normalizeToHundredth(-5.678)).toBe(-5.68);
    expect(normalizeToHundredth(-0.006)).toBe(-0.01);
  });

  it('passes through clean integers', () => {
    expect(normalizeToHundredth(42)).toBe(42);
    expect(normalizeToHundredth(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatToHundredth
// ---------------------------------------------------------------------------
describe('formatToHundredth', () => {
  it('formats to two decimal places', () => {
    expect(formatToHundredth(5)).toBe('5.00');
    expect(formatToHundredth(1.1)).toBe('1.10');
    expect(formatToHundredth(0)).toBe('0.00');
  });

  it('prepends + sign when showPlus is true and value is positive', () => {
    expect(formatToHundredth(3.5, { showPlus: true })).toBe('+3.50');
  });

  it('does not prepend + for zero or negative values', () => {
    expect(formatToHundredth(0, { showPlus: true })).toBe('0.00');
    expect(formatToHundredth(-2, { showPlus: true })).toBe('-2.00');
  });

  it('handles non-numeric gracefully', () => {
    expect(formatToHundredth(null)).toBe('0.00');
    expect(formatToHundredth(undefined)).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// formatSignedCurrency
// ---------------------------------------------------------------------------
describe('formatSignedCurrency', () => {
  it('formats positive values with +$ prefix', () => {
    expect(formatSignedCurrency(12)).toBe('+$12.00');
    expect(formatSignedCurrency(3.5)).toBe('+$3.50');
  });

  it('formats negative values with -$ prefix', () => {
    expect(formatSignedCurrency(-3.5)).toBe('-$3.50');
    expect(formatSignedCurrency(-100)).toBe('-$100.00');
  });

  it('formats zero without sign', () => {
    expect(formatSignedCurrency(0)).toBe('$0.00');
  });

  it('handles non-numeric inputs', () => {
    expect(formatSignedCurrency(null)).toBe('$0.00');
    expect(formatSignedCurrency(undefined)).toBe('$0.00');
    expect(formatSignedCurrency('abc')).toBe('$0.00');
  });

  it('rounds to two decimal places', () => {
    expect(formatSignedCurrency(1.999)).toBe('+$2.00');
    expect(formatSignedCurrency(-0.001)).toBe('$0.00');
  });
});
