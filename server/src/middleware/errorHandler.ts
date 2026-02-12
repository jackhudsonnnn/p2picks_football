/**
 * Global Error Handler Middleware
 *
 * Provides centralized error handling for all Express routes.
 * Supports custom error classes with status codes and ensures
 * consistent error response format across the API.
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { AppError } from '../errors';

const logger = createLogger('errorHandler');

// Re-export AppError for backward compatibility
export { AppError } from '../errors';

// ─────────────────────────────────────────────────────────────────────────────
// Request ID Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a simple request ID for correlation.
 */
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Middleware to attach a unique request ID to each request.
 * Uses existing X-Request-ID header if present, otherwise generates one.
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const requestId = typeof existingId === 'string' && existingId.trim()
    ? existingId.trim()
    : generateRequestId();
  
  // Attach to request for use in handlers and error logging
  (req as any).requestId = requestId;
  next();
}

/**
 * Helper to get request ID from request object.
 */
export function getRequestId(req: Request): string {
  return (req as any).requestId || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Async Handler Wrapper
// ─────────────────────────────────────────────────────────────────────────────

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void> | void;

/**
 * Wraps async route handlers to automatically catch errors
 * and forward them to the error handler middleware.
 *
 * @example
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await userService.findById(req.params.id);
 *   if (!user) throw AppError.notFound('User not found');
 *   res.json(user);
 * }));
 */
export function asyncHandler(fn: AsyncRequestHandler): AsyncRequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Response Format
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorResponse {
  error: string;
  code?: string;
  requestId: string;
  details?: unknown;
}

function buildErrorResponse(
  err: Error,
  requestId: string,
  includeDetails: boolean,
): { statusCode: number; body: ErrorResponse } {
  // Handle known application errors
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: err.message,
        code: err.code,
        requestId,
        ...(includeDetails && err.details ? { details: err.details } : {}),
      },
    };
  }

  // Handle BetProposalError (for backward compatibility)
  // Import dynamically to avoid circular dependencies
  if (err.name === 'BetProposalError' && 'statusCode' in err) {
    const betError = err as Error & { statusCode: number; details?: unknown };
    return {
      statusCode: betError.statusCode,
      body: {
        error: betError.message,
        requestId,
        ...(includeDetails && betError.details ? { details: betError.details } : {}),
      },
    };
  }

  // Handle validation errors (e.g., from zod/joi)
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return {
      statusCode: 400,
      body: {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        requestId,
        ...(includeDetails ? { details: err.message } : {}),
      },
    };
  }

  // Default to internal server error for unknown errors
  return {
    statusCode: 500,
    body: {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handler Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global error handler middleware.
 * Must be registered after all routes.
 *
 * @example
 * app.use('/api', apiRouter);
 * app.use(errorHandler); // Must be last
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = getRequestId(req);
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Log the error
  const logPayload = {
    requestId,
    method: req.method,
    path: req.path,
    error: err.message,
    ...(err instanceof AppError ? { code: err.code, statusCode: err.statusCode } : {}),
    ...(!isProduction ? { stack: err.stack } : {}),
  };

  // Log at appropriate level based on status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  if (statusCode >= 500) {
    logger.error(logPayload, 'Request failed with server error');
  } else if (statusCode >= 400) {
    logger.warn(logPayload, 'Request failed with client error');
  }

  // Build and send response
  const { statusCode: responseStatus, body } = buildErrorResponse(
    err,
    requestId,
    !isProduction,
  );

  // Set request ID header for client correlation
  res.setHeader('X-Request-ID', requestId);
  
  res.status(responseStatus).json(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler for routes that don't match any defined endpoints.
 * Should be registered after all routes but before errorHandler.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Cannot ${req.method} ${req.path}`));
}
