/**
 * Error Message Constants
 *
 * Centralized error messages for consistent API responses.
 * Use these instead of hardcoding strings in controllers.
 */

// ============================================================================
// Authentication & Authorization
// ============================================================================

export const AUTH_REQUIRED = 'Authentication required';
export const UNAUTHORIZED = 'Unauthorized';
export const FORBIDDEN = 'Forbidden';
export const INVALID_TOKEN = 'Invalid or expired token';

// ============================================================================
// Generic Errors
// ============================================================================

export const INTERNAL_ERROR = 'Internal server error';
export const NOT_FOUND = 'Resource not found';
export const BAD_REQUEST = 'Bad request';
export const VALIDATION_FAILED = 'Validation failed';

// ============================================================================
// Rate Limiting
// ============================================================================

export const RATE_LIMIT_EXCEEDED = 'Rate limit exceeded';
export const FRIEND_RATE_LIMIT_EXCEEDED = 'Friend request rate limit exceeded. Please wait before adding more friends.';
export const MESSAGE_RATE_LIMIT_EXCEEDED = 'Message rate limit exceeded. Please wait before sending more messages.';
export const BET_RATE_LIMIT_EXCEEDED = 'Bet creation rate limit exceeded. Please wait before creating more bets.';

// ============================================================================
// Bet Operations
// ============================================================================

export const BET_NOT_FOUND = 'Bet not found';
export const BET_ALREADY_RESOLVED = 'Bet has already been resolved';
export const BET_NOT_PENDING = 'Bet is not in pending status';
export const BET_CREATION_FAILED = 'Failed to create bet proposal';
export const INVALID_BET_ID = 'Invalid bet ID';
export const INVALID_MODE_KEY = 'Invalid mode key';
export const MODE_NOT_FOUND = 'Mode not found';
export const MODE_NOT_SUPPORTED = 'Mode not found or does not support this league';

// ============================================================================
// Table Operations
// ============================================================================

export const TABLE_NOT_FOUND = 'Table not found';
export const TABLE_ID_REQUIRED = 'Table ID is required';
export const NOT_TABLE_MEMBER = 'You are not a member of this table';
export const ALREADY_TABLE_MEMBER = 'User is already a member of this table';
export const TABLE_CREATION_FAILED = 'Failed to create table';
export const TABLE_FETCH_FAILED = 'Failed to fetch tables';

// ============================================================================
// User Operations
// ============================================================================

export const USER_NOT_FOUND = 'User not found';
export const USERNAME_REQUIRED = 'Username is required';
export const INVALID_USERNAME = 'Username must contain letters, numbers, or underscores';
export const USER_LOOKUP_FAILED = 'Unable to lookup user';

// ============================================================================
// Friend Operations
// ============================================================================

export const FRIEND_REQUEST_NOT_FOUND = 'Friend request not found';
export const ALREADY_FRIENDS = 'You are already friends with this user';
export const CANNOT_FRIEND_SELF = 'You cannot send a friend request to yourself';
export const PENDING_REQUEST_EXISTS = 'A pending friend request already exists';

// ============================================================================
// Message Operations
// ============================================================================

export const MESSAGE_REQUIRED = 'Message content is required';
export const MESSAGE_TOO_LONG = 'Message exceeds maximum length';
export const MESSAGE_EMPTY = 'Message cannot be empty';
export const MESSAGE_SEND_FAILED = 'Failed to send message';
export const MESSAGE_FETCH_FAILED = 'Failed to fetch messages';

// ============================================================================
// Pagination
// ============================================================================

export const INVALID_CURSOR = 'Invalid cursor';
export const INVALID_BEFORE_CURSOR = 'Invalid before* cursor';
export const INVALID_AFTER_CURSOR = 'Invalid after* cursor';
export const CURSOR_CONFLICT = 'Use either before* or after*, not both';

// ============================================================================
// Game & League
// ============================================================================

export const GAME_NOT_FOUND = 'Game not found';
export const INVALID_LEAGUE = 'Invalid league';
export const LEAGUE_REQUIRED = 'League is required';
export const GAME_NOT_IN_PROGRESS = 'Game is not in progress';
export const GAME_ALREADY_FINISHED = 'Game has already finished';

// ============================================================================
// Configuration
// ============================================================================

export const CONFIG_REQUIRED = 'Configuration is required';
export const INVALID_CONFIG = 'Invalid configuration';
export const SESSION_NOT_FOUND = 'Session not found';
export const SESSION_EXPIRED = 'Session has expired';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a validation error message with field name.
 */
export function fieldRequired(fieldName: string): string {
  return `${fieldName} is required`;
}

/**
 * Creates a validation error message for invalid value.
 */
export function invalidField(fieldName: string): string {
  return `Invalid ${fieldName}`;
}

/**
 * Creates a not found error message for a specific resource.
 */
export function resourceNotFound(resourceType: string): string {
  return `${resourceType} not found`;
}

/**
 * Creates a failed operation error message.
 */
export function operationFailed(operation: string): string {
  return `Failed to ${operation}`;
}
