import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toDate, formatDateTime, formatTimeOfDay, formatRelativeDateLabel, groupByDateLabel } from './dateTime';

// ---------------------------------------------------------------------------
// toDate
// ---------------------------------------------------------------------------
describe('toDate', () => {
  it('returns null for falsy inputs', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('')).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(toDate('not-a-date')).toBeNull();
  });

  it('parses valid ISO strings', () => {
    const d = toDate('2025-06-15T12:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe('2025-06-15T12:00:00.000Z');
  });

  it('passes through valid Date objects', () => {
    const input = new Date('2025-01-01');
    expect(toDate(input)).toBe(input);
  });

  it('returns null for invalid Date objects', () => {
    expect(toDate(new Date('invalid'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
describe('formatDateTime', () => {
  it('returns null for invalid inputs', () => {
    expect(formatDateTime(null)).toBeNull();
    expect(formatDateTime('garbage')).toBeNull();
  });

  it('formats a date-only string (default options)', () => {
    const result = formatDateTime('2025-06-15T12:00:00Z', { timeZone: 'UTC' });
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });

  it('includes time when requested', () => {
    const result = formatDateTime('2025-06-15T14:30:00Z', {
      includeTime: true,
      hour12: false,
      timeZone: 'UTC',
    });
    expect(result).toContain('14');
    expect(result).toContain('30');
  });
});

// ---------------------------------------------------------------------------
// formatTimeOfDay
// ---------------------------------------------------------------------------
describe('formatTimeOfDay', () => {
  it('returns null for invalid input', () => {
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay('bad')).toBeNull();
  });

  it('formats time of day', () => {
    const result = formatTimeOfDay('2025-06-15T08:05:00Z', {
      hour12: false,
      timeZone: 'UTC',
    });
    expect(result).toContain('08');
    expect(result).toContain('05');
  });
});

// ---------------------------------------------------------------------------
// formatRelativeDateLabel
// ---------------------------------------------------------------------------
describe('formatRelativeDateLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for today\'s date', () => {
    expect(formatRelativeDateLabel('2025-06-15T08:00:00Z')).toBe('Today');
  });

  it('returns "Yesterday" for yesterday', () => {
    expect(formatRelativeDateLabel('2025-06-14T20:00:00Z')).toBe('Yesterday');
  });

  it('returns formatted date for older dates', () => {
    const result = formatRelativeDateLabel('2025-06-10T12:00:00Z');
    expect(result).toContain('Jun');
    expect(result).toContain('10');
  });

  it('returns "Unknown" for null / invalid', () => {
    expect(formatRelativeDateLabel(null)).toBe('Unknown');
    expect(formatRelativeDateLabel('bad')).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// groupByDateLabel
// ---------------------------------------------------------------------------
describe('groupByDateLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups items by date label', () => {
    const items = [
      { id: 1, timestamp: '2025-06-15T08:00:00Z' },
      { id: 2, timestamp: '2025-06-15T10:00:00Z' },
      { id: 3, timestamp: '2025-06-14T20:00:00Z' },
      { id: 4, timestamp: '2025-06-10T12:00:00Z' },
    ];
    const grouped = groupByDateLabel(items);
    expect(grouped['Today']).toHaveLength(2);
    expect(grouped['Yesterday']).toHaveLength(1);
    // Older date gets a formatted label
    const olderKeys = Object.keys(grouped).filter((k) => k !== 'Today' && k !== 'Yesterday');
    expect(olderKeys).toHaveLength(1);
    expect(grouped[olderKeys[0]]).toHaveLength(1);
  });

  it('returns empty object for empty array', () => {
    expect(groupByDateLabel([])).toEqual({});
  });
});
