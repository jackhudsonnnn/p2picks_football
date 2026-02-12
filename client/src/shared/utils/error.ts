/**
 * Error Utilities
 *
 * Type-safe helpers for working with unknown caught errors.
 * Use instead of `catch (e: any) { e.message }`.
 */

/**
 * Extract a human-readable message from an unknown caught value.
 *
 * @example
 * ```ts
 * try { … } catch (e: unknown) {
 *   setError(getErrorMessage(e));
 * }
 * ```
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

/**
 * Extract an error code from an unknown caught value (e.g. Supabase/Postgres errors).
 */
export function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}
