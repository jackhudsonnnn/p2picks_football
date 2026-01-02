/**
 * Betting-related constants shared across the application.
 */

// Session configuration
export const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Wager configuration
export const WAGER_MIN = 0.25;
export const WAGER_MAX = 5;
export const WAGER_STEP = 0.25;
export const DEFAULT_WAGER = 0.25;

// Time limit configuration (in seconds)
export const TIME_LIMIT_MIN = 30;
export const TIME_LIMIT_MAX = 120;
export const TIME_LIMIT_STEP = 15;
export const DEFAULT_TIME_LIMIT = 60;

// Generated choices for wagers
export const WAGER_CHOICES = Array.from(
    { length: Math.floor((WAGER_MAX - WAGER_MIN) / WAGER_STEP + 1e-9) + 1 },
    (_, i) => Number((WAGER_MIN + i * WAGER_STEP).toFixed(2))
  );

// Generated choices for time limits
export const TIME_LIMIT_CHOICES = Array.from(
    { length: Math.floor((TIME_LIMIT_MAX - TIME_LIMIT_MIN) / TIME_LIMIT_STEP) + 1 },
    (_, i) => TIME_LIMIT_MIN + i * TIME_LIMIT_STEP
  );
