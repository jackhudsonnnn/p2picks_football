/**
 * Structured Logger (pino-backed)
 *
 * Drop-in replacement for the previous console-based logger.
 * Every log line is a JSON object containing:
 *   - `level`     — pino numeric level
 *   - `time`      — epoch ms
 *   - `service`   — the tag passed to `createLogger`
 *   - `requestId` — auto-injected from AsyncLocalStorage (when inside an HTTP request)
 *   - `msg`       — human-readable message
 *   - …any extra fields from the payload object
 *
 * In development the output can be piped through `pino-pretty` for
 * human-readable formatting:
 *   npm run dev | npx pino-pretty
 */

import pino from 'pino';
import { env } from '../config/env';
import { getRequestContext } from './requestContext';

// ─────────────────────────────────────────────────────────────────────────────
// Root pino instance
// ─────────────────────────────────────────────────────────────────────────────

const rootLogger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Inject requestId into every log line automatically via a mixin
  mixin() {
    const ctx = getRequestContext();
    return ctx ? { requestId: ctx.requestId } : {};
  },
  // Serialise Error objects cleanly
  serializers: pino.stdSerializers,
});

// ─────────────────────────────────────────────────────────────────────────────
// Public interface (unchanged from previous version)
// ─────────────────────────────────────────────────────────────────────────────

export type LogPayload = Record<string, unknown>;

export interface Logger {
  info(payload: LogPayload | string, message?: string): void;
  debug(payload: LogPayload | string, message?: string): void;
  warn(payload: LogPayload | string, message?: string): void;
  error(payload: LogPayload | string, message?: string): void;
}

/**
 * Create a child logger scoped to a specific service / module.
 *
 * Usage is identical to the previous console-based API:
 *   const logger = createLogger('betService');
 *   logger.info({ betId }, 'Bet created');
 *   logger.error('Something went wrong');
 */
export function createLogger(prefix: string): Logger {
  const child = rootLogger.child({ service: prefix });

  function log(
    level: 'info' | 'debug' | 'warn' | 'error',
    payload: LogPayload | string,
    message?: string,
  ): void {
    if (typeof payload === 'string') {
      child[level](payload);
    } else {
      child[level](payload, message ?? '');
    }
  }

  return {
    info: (p, m) => log('info', p, m),
    debug: (p, m) => log('debug', p, m),
    warn: (p, m) => log('warn', p, m),
    error: (p, m) => log('error', p, m),
  };
}

