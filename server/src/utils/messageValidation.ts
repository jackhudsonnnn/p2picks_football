/**
 * Message validation and sanitization utilities.
 */

import { createLogger } from './logger';

const logger = createLogger('messageValidation');

export interface MessageValidationResult {
  valid: boolean;
  sanitized: string;
  error?: string;
}

/** Maximum allowed message length in characters */
export const MAX_MESSAGE_LENGTH = 2000;

/** Minimum message length (must have content) */
export const MIN_MESSAGE_LENGTH = 1;

/**
 * Patterns to strip from messages (potential XSS vectors, invisible characters, etc.)
 */
const STRIP_PATTERNS = [
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // Control characters (except \t, \n, \r)
  /\u200B/g, // Zero-width space
  /\u200C/g, // Zero-width non-joiner
  /\u200D/g, // Zero-width joiner
  /\uFEFF/g, // Byte order mark
];

/**
 * Validate and sanitize a chat message.
 * 
 * - Trims whitespace
 * - Strips control characters and invisible characters
 * - Enforces length limits
 * - Collapses excessive whitespace
 */
export function validateMessage(input: unknown): MessageValidationResult {
  // Type check
  if (typeof input !== 'string') {
    return {
      valid: false,
      sanitized: '',
      error: 'Message must be a string',
    };
  }

  let text = input;

  // Strip dangerous/invisible characters
  for (const pattern of STRIP_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // Normalize line breaks and collapse excessive newlines
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\n{4,}/g, '\n\n\n'); // Max 3 consecutive newlines

  // Collapse excessive spaces (but preserve single spaces and tabs)
  text = text.replace(/ {10,}/g, '         '); // Max 9 consecutive spaces

  // Trim
  text = text.trim();

  // Check minimum length
  if (text.length < MIN_MESSAGE_LENGTH) {
    return {
      valid: false,
      sanitized: text,
      error: 'Message cannot be empty',
    };
  }

  // Check maximum length
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      sanitized: text.slice(0, MAX_MESSAGE_LENGTH),
      error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  return {
    valid: true,
    sanitized: text,
  };
}

/**
 * Validate a UUID string.
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate table membership for a user.
 * Returns true if the user is a member of the table.
 */
export async function validateTableMembership(
  supabase: any,
  tableId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('table_members')
    .select('member_id')
    .eq('table_id', tableId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message }, 'Query error');
    return false;
  }

  return data !== null;
}
