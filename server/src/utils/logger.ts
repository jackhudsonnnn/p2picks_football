/**
 * Shared logger utility for data services.
 */

import { NODE_ENV } from '../constants/environment';

export type LogPayload = Record<string, unknown>;

export interface Logger {
  info(payload: LogPayload | string, message?: string): void;
  debug(payload: LogPayload | string, message?: string): void;
  warn(payload: LogPayload | string, message?: string): void;
  error(payload: LogPayload | string, message?: string): void;
}

export function createLogger(prefix: string): Logger {
  const tag = `[${prefix}]`;
  return {
    info(payload: LogPayload | string, message?: string) {
      if (typeof payload === 'string') {
        console.info(tag, payload);
      } else {
        console.info(tag, message ?? '', payload);
      }
    },
    debug(payload: LogPayload | string, message?: string) {
      if (NODE_ENV === 'production') return;
      if (typeof payload === 'string') {
        console.debug(tag, payload);
      } else {
        console.debug(tag, message ?? '', payload);
      }
    },
    warn(payload: LogPayload | string, message?: string) {
      if (typeof payload === 'string') {
        console.warn(tag, payload);
      } else {
        console.warn(tag, message ?? '', payload);
      }
    },
    error(payload: LogPayload | string, message?: string) {
      if (typeof payload === 'string') {
        console.error(tag, payload);
      } else {
        console.error(tag, message ?? '', payload);
      }
    },
  };
}
