import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vitest test env has import.meta.env.DEV = true by default
describe('logger', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    vi.resetModules();
  });

  it('logger.error always delegates to console.error', async () => {
    const { logger } = await import('./logger');
    logger.error('boom', 42);
    expect(errorSpy).toHaveBeenCalledWith('boom', 42);
  });

  it('logger.warn delegates to console.warn in dev mode', async () => {
    // In vitest, import.meta.env.DEV is true
    const { logger } = await import('./logger');
    logger.warn('heads up');
    expect(warnSpy).toHaveBeenCalledWith('heads up');
  });
});
