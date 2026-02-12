/**
 * Controller Utilities
 * 
 * Shared helpers for Express controllers to reduce boilerplate
 * and ensure consistent patterns.
 */

import type { Request, Response } from 'express';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { AppError } from '../errors';

/**
 * Authenticated context extracted from a request.
 */
export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
  accessToken: string;
}

/**
 * Extract authenticated context from a request.
 * Throws AppError.unauthorized() if not authenticated.
 * 
 * @example
 * const { supabase, user } = getAuthContext(req);
 */
export function getAuthContext(req: Request): AuthContext {
  const supabase = req.supabase;
  const user = req.authUser;
  const accessToken = req.accessToken;

  if (!supabase || !user || !accessToken) {
    throw AppError.unauthorized('Authentication required');
  }

  return { supabase, user, accessToken };
}

/**
 * Try to get authenticated context, returns null if not authenticated.
 * Useful for endpoints that have optional authentication.
 */
export function tryGetAuthContext(req: Request): AuthContext | null {
  const supabase = req.supabase;
  const user = req.authUser;
  const accessToken = req.accessToken;

  if (!supabase || !user || !accessToken) {
    return null;
  }

  return { supabase, user, accessToken };
}

/**
 * Send a standardized error response.
 * Prefers using AppError instances for consistent error handling.
 */
export function sendErrorResponse(res: Response, error: unknown, fallbackMessage: string): void {
  if (AppError.isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  res.status(500).json({ error: message });
}

/**
 * Parse and validate a required string parameter.
 * Returns the trimmed string or throws AppError.badRequest.
 */
export function requireStringParam(value: unknown, paramName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest(`${paramName} is required`);
  }
  return value.trim();
}

/**
 * Parse an optional string parameter.
 * Returns the trimmed string or undefined.
 */
export function parseStringParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
