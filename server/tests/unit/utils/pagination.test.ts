import { describe, it, expect } from 'vitest';
import {
  normalizeTimestamp,
  parsePageSize,
  isValidIsoTimestamp,
  isValidUuid,
  isValidId,
  isNonEmptyString,
  parseTableCursor,
  buildTableCursor,
  parseTicketCursor,
  buildTicketCursor,
  parseMessageCursor,
  buildMessageCursor,
  createCursorParser,
  createCursorBuilder,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../../src/utils/pagination';

describe('pagination utilities', () => {
  describe('normalizeTimestamp', () => {
    it('should normalize a valid ISO string', () => {
      const input = '2024-01-15T10:30:00.000Z';
      expect(normalizeTimestamp(input)).toBe(input);
    });

    it('should normalize a date string to ISO format', () => {
      const result = normalizeTimestamp('2024-01-15');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return current time for null', () => {
      const before = Date.now();
      const result = normalizeTimestamp(null);
      const after = Date.now();
      const resultTime = new Date(result).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);
    });

    it('should return current time for undefined', () => {
      const result = normalizeTimestamp(undefined);
      expect(new Date(result).getTime()).not.toBeNaN();
    });

    it('should return current time for invalid string', () => {
      const result = normalizeTimestamp('not-a-date');
      expect(new Date(result).getTime()).not.toBeNaN();
    });
  });

  describe('parsePageSize', () => {
    it('should return default for undefined', () => {
      expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should return default for null', () => {
      expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should parse string number', () => {
      expect(parsePageSize('50')).toBe(50);
    });

    it('should accept number directly', () => {
      expect(parsePageSize(30)).toBe(30);
    });

    it('should clamp to MAX_PAGE_SIZE', () => {
      expect(parsePageSize(500)).toBe(MAX_PAGE_SIZE);
    });

    it('should return default for negative', () => {
      expect(parsePageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should return default for zero', () => {
      expect(parsePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should return default for NaN', () => {
      expect(parsePageSize('abc')).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should respect custom default', () => {
      expect(parsePageSize(undefined, 10)).toBe(10);
    });
  });

  describe('validation helpers', () => {
    describe('isValidIsoTimestamp', () => {
      it('should accept valid ISO string', () => {
        expect(isValidIsoTimestamp('2024-01-15T10:30:00.000Z')).toBe(true);
      });

      it('should reject invalid string', () => {
        expect(isValidIsoTimestamp('not-a-date')).toBe(false);
      });

      it('should reject non-string', () => {
        expect(isValidIsoTimestamp(123)).toBe(false);
        expect(isValidIsoTimestamp(null)).toBe(false);
        expect(isValidIsoTimestamp(undefined)).toBe(false);
      });
    });

    describe('isValidUuid', () => {
      it('should accept valid UUID', () => {
        expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      });

      it('should reject invalid UUID', () => {
        expect(isValidUuid('not-a-uuid')).toBe(false);
        expect(isValidUuid('123')).toBe(false);
      });
    });

    describe('isValidId', () => {
      it('should accept UUID', () => {
        expect(isValidId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      });

      it('should accept numeric string', () => {
        expect(isValidId('12345')).toBe(true);
      });

      it('should reject mixed string', () => {
        expect(isValidId('abc123')).toBe(false);
      });
    });

    describe('isNonEmptyString', () => {
      it('should accept non-empty string', () => {
        expect(isNonEmptyString('hello')).toBe(true);
      });

      it('should reject empty string', () => {
        expect(isNonEmptyString('')).toBe(false);
      });

      it('should reject whitespace-only string', () => {
        expect(isNonEmptyString('   ')).toBe(false);
      });

      it('should reject non-string', () => {
        expect(isNonEmptyString(123)).toBe(false);
      });
    });
  });

  describe('parseTableCursor', () => {
    it('should parse valid cursor', () => {
      const result = parseTableCursor({
        activityAt: '2024-01-15T10:30:00.000Z',
        tableId: 'table-123',
      });
      expect(result).toEqual({
        activityAt: '2024-01-15T10:30:00.000Z',
        tableId: 'table-123',
      });
    });

    it('should return null for missing fields', () => {
      expect(parseTableCursor({ activityAt: '2024-01-15T10:30:00.000Z' })).toBeNull();
      expect(parseTableCursor({ tableId: 'table-123' })).toBeNull();
    });

    it('should return null for invalid timestamp', () => {
      expect(parseTableCursor({
        activityAt: 'not-a-date',
        tableId: 'table-123',
      })).toBeNull();
    });

    it('should return null for empty tableId', () => {
      expect(parseTableCursor({
        activityAt: '2024-01-15T10:30:00.000Z',
        tableId: '   ',
      })).toBeNull();
    });
  });

  describe('buildTableCursor', () => {
    it('should build cursor from rows', () => {
      const rows = [
        { table_id: 'table-1', last_activity_at: '2024-01-15T10:30:00.000Z' },
        { table_id: 'table-2', last_activity_at: '2024-01-14T10:30:00.000Z' },
      ];
      const result = buildTableCursor(rows);
      expect(result).toEqual({
        activityAt: '2024-01-14T10:30:00.000Z',
        tableId: 'table-2',
      });
    });

    it('should fall back to created_at', () => {
      const rows = [{ table_id: 'table-1', created_at: '2024-01-15T10:30:00.000Z' }];
      const result = buildTableCursor(rows);
      expect(result?.activityAt).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should return null for empty rows', () => {
      expect(buildTableCursor([])).toBeNull();
    });
  });

  describe('parseTicketCursor', () => {
    it('should parse valid cursor', () => {
      const result = parseTicketCursor({
        participatedAt: '2024-01-15T10:30:00.000Z',
        participationId: '12345',
      });
      expect(result).toEqual({
        participatedAt: '2024-01-15T10:30:00.000Z',
        participationId: '12345',
      });
    });

    it('should accept UUID participationId', () => {
      const result = parseTicketCursor({
        participatedAt: '2024-01-15T10:30:00.000Z',
        participationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result?.participationId).toBe('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('parseMessageCursor', () => {
    it('should parse valid cursor', () => {
      const result = parseMessageCursor({
        postedAt: '2024-01-15T10:30:00.000Z',
        messageId: '12345',
      });
      expect(result).toEqual({
        postedAt: '2024-01-15T10:30:00.000Z',
        messageId: '12345',
      });
    });
  });

  describe('createCursorParser', () => {
    it('should create custom cursor parser', () => {
      interface CustomCursor {
        timestamp: string;
        id: string;
      }

      const parseCustom = createCursorParser<CustomCursor>([
        { field: 'timestamp', validate: isValidIsoTimestamp },
        { field: 'id', validate: isNonEmptyString },
      ]);

      const result = parseCustom({
        timestamp: '2024-01-15T10:30:00.000Z',
        id: 'custom-123',
      });

      expect(result).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        id: 'custom-123',
      });
    });
  });

  describe('createCursorBuilder', () => {
    it('should create custom cursor builder', () => {
      interface CustomCursor {
        timestamp: string;
        id: string;
      }

      const buildCustom = createCursorBuilder<CustomCursor>([
        {
          cursorField: 'timestamp',
          rowFields: ['created_at'],
          transform: (v) => normalizeTimestamp(v as string),
        },
        { cursorField: 'id', rowFields: ['item_id'] },
      ]);

      const rows = [{ item_id: 'item-123', created_at: '2024-01-15T10:30:00.000Z' }];
      const result = buildCustom(rows);

      expect(result).toEqual({
        timestamp: '2024-01-15T10:30:00.000Z',
        id: 'item-123',
      });
    });
  });
});
