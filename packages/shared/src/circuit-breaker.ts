/**
 * CIRCUIT BREAKER — PLAN.md Part X §10.11 (dependency failure), Phase 0 task 0.4.
 *
 * Wraps a call to a dependency that can be down — the AI provider (§8.5),
 * Stripe (§9.1), the email provider — so that a dependency in trouble fails
 * fast instead of holding a request open for its whole timeout, and gets a
 * chance to recover instead of being retried by every in-flight request.
 *
 * ⚠️ WHY THIS IS PRODUCT BEHAVIOUR, NOT PLUMBING. P3 says findings render with
 * or without AI. That promise is only real if an AI outage is CHEAP: without a
 * breaker, every issue page waits out the provider timeout before falling back,
 * and a degraded feature becomes a degraded product. The breaker is what turns
 * "AI is down" into "the explanation section says unavailable".
 *
 * States:
 *   closed    — calls pass through; consecutive failures are counted
 *   open      — calls are refused immediately until `resetAfterMs` has elapsed
 *   half-open — ONE trial call is allowed; success closes, failure re-opens
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** How long to stay open before allowing one trial call. */
  resetAfterMs: number;
  /**
   * Consecutive successes in half-open before closing. Above 1, a flapping
   * dependency has to prove itself more than once.
   */
  successThreshold?: number;
  /** Named so logs and metrics can tell one breaker from another. */
  name: string;
}

/** Thrown instead of calling through while the circuit is open. */
export class CircuitOpenError extends Error {
  readonly circuit: string;
  readonly retryAfterMs: number;

  constructor(circuit: string, retryAfterMs: number) {
    super(`Circuit "${circuit}" is open`);
    this.name = "CircuitOpenError";
    this.circuit = circuit;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface CircuitBreaker {
  /**
   * Runs `fn` under the breaker.
   *
   * @throws CircuitOpenError when the circuit is open — callers catch this and
   *         degrade, they do not retry it.
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly state: CircuitState;
  /** For tests and admin surfaces; never call this to "fix" a live outage. */
  reset(): void;
}

export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const successThreshold = options.successThreshold ?? 1;

  let state: CircuitState = "closed";
  let failures = 0;
  let successes = 0;
  let openedAt = 0;

  function open() {
    state = "open";
    openedAt = Date.now();
    successes = 0;
  }

  return {
    get state() {
      // Reading the state also performs the open → half-open transition. There
      // is no timer: a breaker that woke itself on an interval would keep a
      // process alive and would fire for circuits nothing is using any more.
      if (state === "open" && Date.now() - openedAt >= options.resetAfterMs) {
        state = "half-open";
        successes = 0;
      }
      return state;
    },

    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (this.state === "open") {
        throw new CircuitOpenError(
          options.name,
          Math.max(0, options.resetAfterMs - (Date.now() - openedAt)),
        );
      }

      try {
        const result = await fn();

        if (state === "half-open") {
          successes += 1;
          if (successes >= successThreshold) {
            state = "closed";
            failures = 0;
          }
        } else {
          // A success in `closed` clears the count: the threshold is
          // CONSECUTIVE failures, so an occasional error among healthy traffic
          // must not accumulate into an outage that never happened.
          failures = 0;
        }

        return result;
      } catch (error) {
        if (state === "half-open") {
          // The trial call failed — straight back to open, full timer.
          open();
          throw error;
        }

        failures += 1;
        if (failures >= options.failureThreshold) open();
        throw error;
      }
    },

    reset() {
      state = "closed";
      failures = 0;
      successes = 0;
      openedAt = 0;
    },
  };
}
