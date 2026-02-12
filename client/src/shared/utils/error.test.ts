import { describe, it, expect } from 'vitest';
import { getErrorMessage, getErrorCode } from './error';

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------
describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('oops'))).toBe('oops');
  });

  it('returns string errors directly', () => {
    expect(getErrorMessage('something went wrong')).toBe('something went wrong');
  });

  it('extracts message from plain objects with a message property', () => {
    expect(getErrorMessage({ message: 'plain object error' })).toBe('plain object error');
  });

  it('ignores non-string message properties', () => {
    expect(getErrorMessage({ message: 42 })).toBe('An unexpected error occurred');
  });

  it('returns default fallback for null / undefined / number', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getErrorMessage(123)).toBe('An unexpected error occurred');
  });

  it('supports custom fallback', () => {
    expect(getErrorMessage(null, 'custom fallback')).toBe('custom fallback');
  });
});

// ---------------------------------------------------------------------------
// getErrorCode
// ---------------------------------------------------------------------------
describe('getErrorCode', () => {
  it('extracts code from objects with a string code property', () => {
    expect(getErrorCode({ code: '23505' })).toBe('23505');
  });

  it('returns undefined when code is not a string', () => {
    expect(getErrorCode({ code: 404 })).toBeUndefined();
  });

  it('returns undefined for non-objects', () => {
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode(undefined)).toBeUndefined();
    expect(getErrorCode('string')).toBeUndefined();
    expect(getErrorCode(42)).toBeUndefined();
  });

  it('returns undefined when no code property exists', () => {
    expect(getErrorCode({ message: 'no code' })).toBeUndefined();
    expect(getErrorCode(new Error('plain error'))).toBeUndefined();
  });
});
