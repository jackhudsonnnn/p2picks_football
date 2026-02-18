import { describe, it, expect, vi } from 'vitest';
import { createLogger, type Logger } from '../../../src/utils/logger';

describe('logger (pino-backed)', () => {
  it('creates a logger with all four methods', () => {
    const logger: Logger = createLogger('test');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('does not throw when called with a string payload', () => {
    const logger = createLogger('test');
    expect(() => logger.info('simple message')).not.toThrow();
    expect(() => logger.debug('debug message')).not.toThrow();
    expect(() => logger.warn('warning')).not.toThrow();
    expect(() => logger.error('error')).not.toThrow();
  });

  it('does not throw when called with an object payload', () => {
    const logger = createLogger('test');
    expect(() => logger.info({ key: 'value' }, 'message')).not.toThrow();
    expect(() => logger.error({ err: new Error('boom') }, 'failed')).not.toThrow();
  });

  it('does not throw when called with payload and no message', () => {
    const logger = createLogger('test');
    expect(() => logger.info({ count: 5 })).not.toThrow();
  });
});
