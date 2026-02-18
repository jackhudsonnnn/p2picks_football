/**
 * Request Validation Middleware
 *
 * Generic Express middleware that validates `req.body` and/or `req.params`
 * against Zod schemas. Returns a structured 400 response on failure.
 *
 * @example
 * router.post('/bets', validateBody(createBetSchema), asyncHandler(betController.createBet));
 * router.get('/bets/:betId', validateParams(betIdParamsSchema), asyncHandler(betController.getBet));
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodType, ZodError } from 'zod';

/**
 * Format Zod issues into a flat, human-readable array.
 */
function formatZodErrors(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Middleware that validates `req.body` against a Zod schema.
 * On success the validated (and possibly coerced / defaulted) data
 * replaces `req.body` so downstream handlers get typed values.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      _res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
      return;
    }
    // Replace body with parsed (coerced / defaulted) values
    req.body = result.data;
    next();
  };
}

/**
 * Middleware that validates `req.params` against a Zod schema.
 * Useful for enforcing UUID format on path parameters.
 */
export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      _res.status(400).json({
        error: 'Invalid path parameters',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
      return;
    }
    // Overwrite params with validated values
    (req as any).params = result.data;
    next();
  };
}
