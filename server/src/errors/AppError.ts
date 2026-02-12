/**
 * AppError - Unified application error class
 *
 * Base class for all application errors with HTTP status codes.
 * Use this instead of creating domain-specific error classes.
 *
 * @example
 * throw AppError.notFound('User not found');
 * throw AppError.badRequest('Invalid input', { field: 'email' });
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 400 Bad Request - Invalid input or malformed request
   */
  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  /**
   * 401 Unauthorized - Missing or invalid authentication
   */
  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  /**
   * 403 Forbidden - Authenticated but not allowed
   */
  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  /**
   * 404 Not Found - Resource doesn't exist
   */
  static notFound(message: string = 'Not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  /**
   * 409 Conflict - Resource state conflict
   */
  static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 409, 'CONFLICT', details);
  }

  /**
   * 429 Too Many Requests - Rate limit exceeded
   */
  static tooManyRequests(message: string, retryAfter?: number): AppError {
    return new AppError(message, 429, 'RATE_LIMITED', { retryAfter });
  }

  /**
   * 500 Internal Server Error - Unexpected server error
   */
  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }

  /**
   * Check if an error is an AppError
   */
  static isAppError(err: unknown): err is AppError {
    return err instanceof AppError || (err instanceof Error && err.name === 'AppError');
  }
}
