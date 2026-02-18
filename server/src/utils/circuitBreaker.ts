/**
 * Circuit Breaker
 *
 * A lightweight state-machine implementation of the circuit breaker pattern.
 *
 *   CLOSED  ──(N consecutive failures)──▶  OPEN
 *   OPEN    ──(cooldown elapsed)────────▶  HALF_OPEN
 *   HALF_OPEN ──(call succeeds)─────────▶  CLOSED
 *   HALF_OPEN ──(call fails)────────────▶  OPEN
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 });
 *   const result = await breaker.call(() => fetch(url));
 */

import { createLogger } from './logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Name for logging. */
  name: string;
  /** Number of consecutive failures before the circuit opens. Default 5. */
  failureThreshold?: number;
  /** Time in ms the circuit stays open before allowing a probe. Default 30 000 (30s). */
  cooldownMs?: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly logger;

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name;
    this.failureThreshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.logger = createLogger(`circuitBreaker:${this.name}`);
  }

  /** Current state of the breaker. */
  getState(): CircuitState {
    return this.state;
  }

  /** Number of consecutive failures recorded. */
  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /**
   * Execute `fn` through the circuit breaker.
   *
   * - **CLOSED** — calls pass through normally.
   * - **OPEN** — calls are short-circuited immediately (`null` is returned).
   *   If the cooldown has elapsed the state transitions to HALF_OPEN and the
   *   call is attempted as a probe.
   * - **HALF_OPEN** — a single probe call is allowed. Success → CLOSED,
   *   failure → OPEN (cooldown resets).
   */
  async call<T>(fn: () => Promise<T | null>): Promise<T | null> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.logger.info({}, 'transitioning to HALF_OPEN (probe allowed)');
      } else {
        // Still within cooldown — short-circuit
        return null;
      }
    }

    try {
      const result = await fn();

      // Treat `null` from the underlying call as a soft failure (ESPN returns null on HTTP errors).
      // Only reset on a truthy result.
      if (result !== null && result !== undefined) {
        this.onSuccess();
      }

      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Force-close the breaker (useful in tests or admin overrides). */
  reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.logger.info({}, 'probe succeeded — circuit CLOSED');
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;

    if (this.state === 'HALF_OPEN') {
      this.trip();
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    this.openedAt = Date.now();
    this.logger.warn(
      { failures: this.consecutiveFailures, cooldownMs: this.cooldownMs },
      'circuit OPENED',
    );
  }
}
