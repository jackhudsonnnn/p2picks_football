/**
 * Request Context
 *
 * Uses Node.js `AsyncLocalStorage` to propagate request-scoped context
 * (e.g., requestId) across the entire call chain without passing it
 * through every function signature.
 *
 * The middleware sets context at the start of each HTTP request.
 * The logger reads it automatically so every log line includes `requestId`.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  /** Unique identifier for the HTTP request. */
  requestId: string;
}

/**
 * Singleton AsyncLocalStorage instance shared across the process.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context, or `undefined` if called outside
 * an HTTP request (e.g., during startup, background jobs).
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
