/**
 * Betting-related constants shared across the application.
 */

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

// Session configuration
export const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Generate choices arrays
export function generateWagerChoices(): number[] {
  const choices: number[] = [];
  for (let value = WAGER_MIN; value <= WAGER_MAX + 1e-9; value += WAGER_STEP) {
    choices.push(Number(value.toFixed(2)));
  }
  return choices;
}

export function generateTimeLimitChoices(): number[] {
  const choices: number[] = [];
  for (let value = TIME_LIMIT_MIN; value <= TIME_LIMIT_MAX; value += TIME_LIMIT_STEP) {
    choices.push(value);
  }
  return choices;
}

export const WAGER_CHOICES = generateWagerChoices();
export const TIME_LIMIT_CHOICES = generateTimeLimitChoices();
