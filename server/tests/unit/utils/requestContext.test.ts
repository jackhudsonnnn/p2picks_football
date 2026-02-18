import { describe, it, expect } from 'vitest';
import { requestContext, getRequestContext } from '../../../src/utils/requestContext';

describe('requestContext', () => {
  it('returns undefined outside a request scope', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('returns the context inside a run scope', () => {
    requestContext.run({ requestId: 'test-123' }, () => {
      const ctx = getRequestContext();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toBe('test-123');
    });
  });

  it('isolates contexts across nested runs', () => {
    requestContext.run({ requestId: 'outer' }, () => {
      expect(getRequestContext()!.requestId).toBe('outer');

      requestContext.run({ requestId: 'inner' }, () => {
        expect(getRequestContext()!.requestId).toBe('inner');
      });

      // Outer context is restored
      expect(getRequestContext()!.requestId).toBe('outer');
    });
  });

  it('returns undefined after run scope ends', async () => {
    await new Promise<void>((resolve) => {
      requestContext.run({ requestId: 'scoped' }, () => {
        expect(getRequestContext()!.requestId).toBe('scoped');
        resolve();
      });
    });

    // Outside the run scope
    expect(getRequestContext()).toBeUndefined();
  });
});
