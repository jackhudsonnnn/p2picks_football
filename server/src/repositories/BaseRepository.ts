/**
 * Base Repository
 *
 * Abstract base class for all entity repositories.
 * Provides common utilities for Supabase data access.
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { createLogger, type Logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface CursorPaginationOptions<TCursor> {
  limit?: number;
  before?: TCursor;
  after?: TCursor;
}

export interface PaginatedResult<T> {
  data: T[];
  hasMore: boolean;
}

export interface RepositoryError extends Error {
  cause: PostgrestError;
  context: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Base Repository
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseRepository {
  protected readonly logger: Logger;

  constructor(
    protected readonly supabase: SupabaseClient,
    loggerName: string,
  ) {
    this.logger = createLogger(loggerName);
  }

  /**
   * Wrap a Supabase error with context for logging.
   */
  protected wrapError(
    message: string,
    error: PostgrestError,
    context: Record<string, unknown> = {},
  ): RepositoryError {
    this.logger.error({ ...context, error: error.message }, message);
    const wrappedError = new Error(`${message}: ${error.message}`) as RepositoryError;
    wrappedError.cause = error;
    wrappedError.context = context;
    return wrappedError;
  }

  /**
   * Parse a page size with bounds.
   */
  protected parseLimit(limit: unknown, defaultLimit = 20, maxLimit = 100): number {
    const parsed = typeof limit === 'number' ? limit : parseInt(String(limit), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
    return Math.min(parsed, maxLimit);
  }
}
