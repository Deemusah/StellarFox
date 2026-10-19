// ============================================================
// BANKERCHANGER — Circuit Breaker
// Prevents cascading failures from external service calls
// (blockchain, oracle APIs, etc.) by implementing the
// classic three-state circuit breaker pattern.
//
// States:
//   CLOSED   — normal operation, calls pass through
//   OPEN     — circuit tripped; calls fail fast with CircuitBreakerError
//   HALF_OPEN — probe state; one test call is allowed through
//
// Transition rules:
//   CLOSED  → OPEN      when consecutive failures exceed threshold
//   OPEN    → HALF_OPEN after resetTimeout ms
//   HALF_OPEN → CLOSED  on success
//   HALF_OPEN → OPEN    on failure (back to full open)
// ============================================================

import { logger } from '../utils/logger';
import { Counter, Gauge, register } from 'prom-client';

// ── Prometheus metrics ────────────────────────────────────────────────────────

const circuitBreakerStateGauge = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state: 0=CLOSED, 1=OPEN, 2=HALF_OPEN',
  labelNames: ['name'] as const,
  registers: [register],
});

const circuitBreakerCallsTotal = new Counter({
  name: 'circuit_breaker_calls_total',
  help: 'Total calls through a circuit breaker, by result',
  labelNames: ['name', 'result'] as const, // result: success | failure | rejected
  registers: [register],
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /**
   * Number of consecutive failures before opening the circuit.
   * @default 5
   */
  failureThreshold?: number;
  /**
   * Time in milliseconds before transitioning from OPEN → HALF_OPEN.
   * @default 30_000 (30 s)
   */
  resetTimeoutMs?: number;
  /**
   * Optional call timeout in milliseconds.
   * If the wrapped call takes longer than this, it is treated as a failure.
   * @default undefined (no timeout)
   */
  callTimeoutMs?: number;
  /**
   * Predicate to determine whether an error should count as a failure.
   * Returns `true` by default for every error (any thrown value).
   */
  isFailure?: (err: unknown) => boolean;
}

/**
 * Thrown when a call is rejected because the circuit is OPEN.
 * Callers can catch this specifically to return a graceful fallback
 * without logging the error as a real service failure.
 */
export class CircuitBreakerError extends Error {
  constructor(
    public readonly name: string,
    public readonly state: CircuitBreakerState,
  ) {
    super(`Circuit breaker "${name}" is ${state} — call rejected`);
    this.name = 'CircuitBreakerError';
    Object.setPrototypeOf(this, CircuitBreakerError.prototype);
  }
}

// ── Implementation ────────────────────────────────────────────────────────────

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly callTimeoutMs?: number;
  private readonly isFailure: (err: unknown) => boolean;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.callTimeoutMs = options.callTimeoutMs;
    this.isFailure = options.isFailure ?? (() => true);

    // Set initial metric
    circuitBreakerStateGauge.labels(name).set(0);
  }

  /** Returns the current state of the circuit breaker. */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /** Returns the current consecutive failure count. */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Wraps an async operation with circuit-breaker protection.
   *
   * - CLOSED:    executes the call; on failure increments counter and trips open
   *              when threshold is exceeded
   * - OPEN:      rejects immediately with CircuitBreakerError; transitions to
   *              HALF_OPEN when resetTimeoutMs has elapsed
   * - HALF_OPEN: lets one call through; on success resets to CLOSED, on failure
   *              trips back to OPEN
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.tryTransitionToHalfOpen();

    if (this.state === 'OPEN') {
      circuitBreakerCallsTotal.labels(this.name, 'rejected').inc();
      throw new CircuitBreakerError(this.name, this.state);
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      if (err instanceof CircuitBreakerError) throw err; // re-throw our own error
      this.onFailure(err);
      throw err;
    }
  }

  /** Manually trips the circuit breaker open (useful for admin override). */
  trip(): void {
    this.transition('OPEN');
    this.lastFailureTime = Date.now();
    logger.warn({ name: this.name }, 'Circuit breaker manually tripped');
  }

  /** Manually resets the circuit breaker to CLOSED (useful for admin override). */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.transition('CLOSED');
    logger.info({ name: this.name }, 'Circuit breaker manually reset');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.callTimeoutMs) return fn();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Circuit breaker "${this.name}": call timed out after ${this.callTimeoutMs}ms`));
      }, this.callTimeoutMs);

      fn().then(
        (value) => { clearTimeout(timeoutId); resolve(value); },
        (err) => { clearTimeout(timeoutId); reject(err); },
      );
    });
  }

  private tryTransitionToHalfOpen(): void {
    if (
      this.state === 'OPEN' &&
      this.lastFailureTime !== null &&
      Date.now() - this.lastFailureTime >= this.resetTimeoutMs
    ) {
      this.transition('HALF_OPEN');
      logger.info(
        { name: this.name, resetTimeoutMs: this.resetTimeoutMs },
        'Circuit breaker entering HALF_OPEN — testing recovery',
      );
    }
  }

  private onSuccess(): void {
    circuitBreakerCallsTotal.labels(this.name, 'success').inc();

    if (this.state === 'HALF_OPEN') {
      this.failureCount = 0;
      this.lastFailureTime = null;
      this.transition('CLOSED');
      logger.info({ name: this.name }, 'Circuit breaker closed — service recovered');
    } else {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  private onFailure(err: unknown): void {
    if (!this.isFailure(err)) {
      // Not a counted failure (e.g. validation errors the caller excluded)
      circuitBreakerCallsTotal.labels(this.name, 'success').inc();
      return;
    }

    circuitBreakerCallsTotal.labels(this.name, 'failure').inc();
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn(
      {
        name: this.name,
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
        err: err instanceof Error ? err.message : String(err),
      },
      'Circuit breaker failure recorded',
    );

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.transition('OPEN');
      logger.error(
        {
          name: this.name,
          failureCount: this.failureCount,
          resetAfterMs: this.resetTimeoutMs,
        },
        'Circuit breaker opened — external service appears unhealthy',
      );
    }
  }

  private transition(newState: CircuitBreakerState): void {
    if (this.state === newState) return;
    const prevState = this.state;
    this.state = newState;

    const stateValue = newState === 'CLOSED' ? 0 : newState === 'OPEN' ? 1 : 2;
    circuitBreakerStateGauge.labels(this.name).set(stateValue);

    logger.info(
      { name: this.name, from: prevState, to: newState },
      'Circuit breaker state transition',
    );
  }
}

// ── Singleton registry ────────────────────────────────────────────────────────

const registry = new Map<string, CircuitBreaker>();

/**
 * Returns a named circuit breaker, creating it with the given options on
 * first access. Subsequent calls with the same name ignore options and return
 * the existing instance (singleton per name).
 *
 * @example
 * const cb = getCircuitBreaker('stellar-rpc', {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30_000,
 *   callTimeoutMs: 10_000,
 * });
 * const txHash = await cb.execute(() => StellarService.invokeContract(...));
 */
export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker(name, options));
    logger.info(
      {
        name,
        failureThreshold: options?.failureThreshold ?? 5,
        resetTimeoutMs: options?.resetTimeoutMs ?? 30_000,
      },
      'Circuit breaker registered',
    );
  }
  return registry.get(name)!;
}

/**
 * Returns a snapshot of all registered circuit breakers and their states.
 * Useful for the health endpoint.
 */
export function getCircuitBreakerStatus(): Array<{
  name: string;
  state: CircuitBreakerState;
  failureCount: number;
}> {
  return Array.from(registry.values()).map((cb) => ({
    name: cb.name,
    state: cb.getState(),
    failureCount: cb.getFailureCount(),
  }));
}
