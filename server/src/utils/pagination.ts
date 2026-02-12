/**
 * Pagination Utilities
 *
 * Provides generic cursor-based pagination helpers for use across controllers.
 * Supports both timestamp+id compound cursors and simple offset-based cursors.
 */

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ============================================================================
// Validation Helpers
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGITS_REGEX = /^\d+$/;

/**
 * Checks if a value is a valid ISO timestamp string.
 */
export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Checks if a value is a valid UUID.
 */
export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Checks if a value is a valid ID (UUID or numeric string).
 */
export function isValidId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value) || DIGITS_REGEX.test(value);
}

/**
 * Checks if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ============================================================================
// Timestamp Normalization
// ============================================================================

/**
 * Normalizes a timestamp value to an ISO string.
 * Returns current time if value is null, undefined, or invalid.
 *
 * @param value - The timestamp value to normalize
 * @returns ISO timestamp string
 */
export function normalizeTimestamp(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

// ============================================================================
// Page Size Helpers
// ============================================================================

/**
 * Parses and validates a page size from request query params.
 * Clamps value between 1 and MAX_PAGE_SIZE.
 *
 * @param rawLimit - The raw limit value from query params
 * @param defaultSize - Default page size (default: DEFAULT_PAGE_SIZE)
 * @returns Validated page size
 */
export function parsePageSize(
  rawLimit: unknown,
  defaultSize: number = DEFAULT_PAGE_SIZE,
): number {
  if (rawLimit === undefined || rawLimit === null) {
    return defaultSize;
  }

  const parsed = typeof rawLimit === 'number' ? rawLimit : parseInt(String(rawLimit), 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return defaultSize;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

// ============================================================================
// Generic Cursor Parser Factory
// ============================================================================

/**
 * Configuration for a cursor field.
 */
export interface CursorFieldConfig {
  /** Field name in the cursor object */
  field: string;
  /** Validator function for the field value */
  validate: (value: unknown) => boolean;
  /** Optional transformer for the value (e.g., normalizing timestamps) */
  transform?: (value: string) => string;
}

/**
 * Creates a cursor parser function for the given field configuration.
 *
 * @param fields - Array of field configurations
 * @returns Parser function that takes raw cursor data and returns typed cursor or null
 *
 * @example
 * const parseTableCursor = createCursorParser<TableCursor>([
 *   { field: 'activityAt', validate: isValidIsoTimestamp, transform: normalizeTimestamp },
 *   { field: 'tableId', validate: isNonEmptyString },
 * ]);
 */
export function createCursorParser<T>(
  fields: CursorFieldConfig[],
): (raw: unknown) => T | null {
  return (raw: unknown): T | null => {
    if (!raw || typeof raw !== 'object') return null;

    const cursor: Record<string, string> = {};
    const rawObj = raw as Record<string, unknown>;

    for (const config of fields) {
      const value = rawObj[config.field];

      if (typeof value !== 'string') return null;
      if (!config.validate(value)) return null;

      cursor[config.field] = config.transform ? config.transform(value) : value;
    }

    return cursor as T;
  };
}

// ============================================================================
// Generic Cursor Builder Factory
// ============================================================================

/**
 * Configuration for building a cursor from a database row.
 */
export interface CursorBuildConfig<T> {
  /** Field name in the cursor object */
  cursorField: string;
  /** Field name(s) in the database row to read from (first found is used) */
  rowFields: string[];
  /** Optional transformer for the value */
  transform?: (value: unknown) => string;
}

/**
 * Creates a cursor builder function for the given configuration.
 *
 * @param configs - Array of build configurations
 * @returns Builder function that takes an array of rows and returns cursor for next page
 *
 * @example
 * const buildTableCursor = createCursorBuilder<TableCursor>([
 *   {
 *     cursorField: 'activityAt',
 *     rowFields: ['last_activity_at', 'created_at'],
 *     transform: (v) => normalizeTimestamp(v as string),
 *   },
 *   { cursorField: 'tableId', rowFields: ['table_id'] },
 * ]);
 */
export function createCursorBuilder<T>(
  configs: CursorBuildConfig<T>[],
): (rows: Record<string, unknown>[]) => T | null {
  return (rows: Record<string, unknown>[]): T | null => {
    if (!rows.length) return null;

    const last = rows[rows.length - 1];
    const cursor: Record<string, string> = {};

    for (const config of configs) {
      let value: unknown = undefined;

      for (const rowField of config.rowFields) {
        if (last[rowField] !== undefined && last[rowField] !== null) {
          value = last[rowField];
          break;
        }
      }

      if (value === undefined || value === null) return null;

      cursor[config.cursorField] = config.transform
        ? config.transform(value)
        : String(value);
    }

    return cursor as T;
  };
}

// ============================================================================
// Pre-built Cursor Types and Parsers
// ============================================================================

/**
 * Cursor for table pagination (sorted by activity time).
 */
export interface TableCursor {
  activityAt: string;
  tableId: string;
}

export const parseTableCursor = createCursorParser<TableCursor>([
  { field: 'activityAt', validate: isValidIsoTimestamp, transform: (v) => new Date(v).toISOString() },
  { field: 'tableId', validate: isNonEmptyString },
]);

export const buildTableCursor = createCursorBuilder<TableCursor>([
  {
    cursorField: 'activityAt',
    rowFields: ['last_activity_at', 'created_at'],
    transform: (v) => normalizeTimestamp(v as string),
  },
  { cursorField: 'tableId', rowFields: ['table_id'] },
]);

/**
 * Cursor for ticket pagination (sorted by participation time).
 */
export interface TicketCursor {
  participatedAt: string;
  participationId: string;
}

export const parseTicketCursor = createCursorParser<TicketCursor>([
  { field: 'participatedAt', validate: isValidIsoTimestamp, transform: (v) => new Date(v).toISOString() },
  { field: 'participationId', validate: isValidId },
]);

export const buildTicketCursor = createCursorBuilder<TicketCursor>([
  {
    cursorField: 'participatedAt',
    rowFields: ['participation_time'],
    transform: (v) => normalizeTimestamp(v as string),
  },
  { cursorField: 'participationId', rowFields: ['participation_id'] },
]);

/**
 * Cursor for message pagination (sorted by posted time).
 */
export interface MessageCursor {
  postedAt: string;
  messageId: string;
}

export const parseMessageCursor = createCursorParser<MessageCursor>([
  { field: 'postedAt', validate: isValidIsoTimestamp, transform: (v) => new Date(v).toISOString() },
  { field: 'messageId', validate: isValidId },
]);

export const buildMessageCursor = createCursorBuilder<MessageCursor>([
  {
    cursorField: 'postedAt',
    rowFields: ['posted_at'],
    transform: (v) => normalizeTimestamp(v as string),
  },
  { cursorField: 'messageId', rowFields: ['message_id'] },
]);
