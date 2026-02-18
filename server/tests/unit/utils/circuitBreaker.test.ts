import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, type CircuitState } from '../../../src/utils/circuitBreaker';

// Suppress logger output during tests
vi.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      cooldownMs: 5_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Initial state ───────────────────────────────────────────────

  it('starts in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  // ─── CLOSED behaviour ────────────────────────────────────────────

  it('passes calls through in CLOSED state', async () => {
    const result = await breaker.call(async () => 42);
    expect(result).toBe(42);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('tracks consecutive failures but stays CLOSED below threshold', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };

    // 2 failures < threshold of 3
    await expect(breaker.call(fail)).rejects.toThrow('boom');
    await expect(breaker.call(fail)).rejects.toThrow('boom');

    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(2);
  });

  it('resets failure count on a successful call', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };

    await expect(breaker.call(fail)).rejects.toThrow();
    await expect(breaker.call(fail)).rejects.toThrow();
    expect(breaker.getFailureCount()).toBe(2);

    // Success resets
    await breaker.call(async () => 'ok');
    expect(breaker.getFailureCount()).toBe(0);
  });

  // ─── CLOSED → OPEN transition ────────────────────────────────────

  it('opens after reaching the failure threshold', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };

    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.getFailureCount()).toBe(3);
  });

  // ─── OPEN behaviour ──────────────────────────────────────────────

  it('short-circuits calls while OPEN (returns null)', async () => {
    // Trip the breaker
    const fail = async (): Promise<number> => { throw new Error('boom'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('OPEN');

    // Calls return null immediately — fn is never invoked
    const spy = vi.fn(async () => 999);
    const result = await breaker.call(spy);
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  // ─── OPEN → HALF_OPEN transition ─────────────────────────────────

  it('transitions to HALF_OPEN after cooldown', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }

    // Advance past cooldown
    vi.advanceTimersByTime(5_001);

    // Next call should attempt (probe)
    const result = await breaker.call(async () => 'probed');
    expect(result).toBe('probed');
    expect(breaker.getState()).toBe('CLOSED');
  });

  // ─── HALF_OPEN behaviour ─────────────────────────────────────────

  it('returns to CLOSED on successful probe', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }

    vi.advanceTimersByTime(5_001);

    await breaker.call(async () => 'ok');
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('returns to OPEN on failed probe', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }

    vi.advanceTimersByTime(5_001);

    // Probe fails
    await expect(breaker.call(fail)).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');
  });

  // ─── null / undefined handling ────────────────────────────────────

  it('does not reset on null return (soft failure)', async () => {
    // Trip to HALF_OPEN
    const fail = async (): Promise<number> => { throw new Error('boom'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }
    vi.advanceTimersByTime(5_001);

    // fn returns null — treated as soft failure, doesn't close circuit
    // (the state machine moves to HALF_OPEN when cooldown passes and
    //  call() is invoked; null return doesn't trigger onSuccess)
    const result = await breaker.call(async () => null);
    expect(result).toBeNull();
    // It should remain HALF_OPEN (null doesn't call onSuccess, doesn't throw to call onFailure)
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  // ─── reset() method ──────────────────────────────────────────────

  it('manually resets an OPEN breaker to CLOSED', async () => {
    const fail = async (): Promise<number> => { throw new Error('boom'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('OPEN');

    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  // ─── Default options ──────────────────────────────────────────────

  it('uses default failureThreshold (5) and cooldownMs (30s) if not provided', async () => {
    const defaultBreaker = new CircuitBreaker({ name: 'defaults' });
    const fail = async (): Promise<number> => { throw new Error('boom'); };

    // 4 failures should NOT open it (default threshold = 5)
    for (let i = 0; i < 4; i++) {
      await expect(defaultBreaker.call(fail)).rejects.toThrow();
    }
    expect(defaultBreaker.getState()).toBe('CLOSED');

    // 5th failure opens it
    await expect(defaultBreaker.call(fail)).rejects.toThrow();
    expect(defaultBreaker.getState()).toBe('OPEN');

    // 29s is not enough for default 30s cooldown
    vi.advanceTimersByTime(29_000);
    const spy = vi.fn(async () => 999);
    const r = await defaultBreaker.call(spy);
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();

    // 1s more => cooldown elapsed
    vi.advanceTimersByTime(1_001);
    const result = await defaultBreaker.call(async () => 'ok');
    expect(result).toBe('ok');
    expect(defaultBreaker.getState()).toBe('CLOSED');
  });
});
