/**
 * Thin logger that silences non-error output in production builds.
 *
 * `logger.warn`  → only prints during development (`import.meta.env.DEV`)
 * `logger.error` → always prints (errors should be visible in prod for debugging)
 */
const isDev = import.meta.env.DEV;

export const logger = {
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
} as const;
