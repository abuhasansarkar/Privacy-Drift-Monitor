import { describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  memoryRateLimitStore,
  rateLimitHeaders,
  rateLimitKey,
} from "../rate-limit";
import { createCircuitBreaker, CircuitOpenError } from "../circuit-breaker";

describe("rate limiter", () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it("allows up to the limit and refuses after it", async () => {
    const store = memoryRateLimitStore();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await checkRateLimit(store, "k", rule));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    // Optional chaining, not a `!`: the tsconfig sets noUncheckedIndexedAccess,
    // and `undefined` would fail this assertion anyway rather than pass it.
    expect(results[2]?.remaining).toBe(0);
  });

  it("keeps budgets separate per key", async () => {
    const store = memoryRateLimitStore();
    for (let i = 0; i < 3; i++) await checkRateLimit(store, "a", rule);
    const other = await checkRateLimit(store, "b", rule);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(2);
  });

  it("namespaces keys so two features cannot share a budget", () => {
    expect(rateLimitKey("scan", "1.2.3.4")).not.toBe(rateLimitKey("login", "1.2.3.4"));
  });

  it("starts the window at the first request, not the latest", async () => {
    vi.useFakeTimers();
    try {
      const store = memoryRateLimitStore();
      await checkRateLimit(store, "k", rule);
      vi.advanceTimersByTime(30_000);
      const second = await checkRateLimit(store, "k", rule);
      // A sliding TTL would report 60 here and the window would never close
      // under steady traffic.
      expect(second.resetSeconds).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reopens the budget once the window expires", async () => {
    vi.useFakeTimers();
    try {
      const store = memoryRateLimitStore();
      for (let i = 0; i < 4; i++) await checkRateLimit(store, "k", rule);
      vi.advanceTimersByTime(61_000);
      expect((await checkRateLimit(store, "k", rule)).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends Retry-After only on a rejection", () => {
    const allowed = rateLimitHeaders({ allowed: true, limit: 3, remaining: 2, resetSeconds: 60 });
    const denied = rateLimitHeaders({ allowed: false, limit: 3, remaining: 0, resetSeconds: 42 });
    expect(allowed["Retry-After"]).toBeUndefined();
    expect(denied["Retry-After"]).toBe("42");
  });
});

describe("circuit breaker", () => {
  const options = { name: "ai", failureThreshold: 2, resetAfterMs: 1000 };
  const boom = () => Promise.reject(new Error("dependency down"));

  it("passes calls through while closed", async () => {
    const breaker = createCircuitBreaker(options);
    await expect(breaker.run(async () => "ok")).resolves.toBe("ok");
    expect(breaker.state).toBe("closed");
  });

  it("opens after the threshold and then refuses without calling through", async () => {
    const breaker = createCircuitBreaker(options);
    await expect(breaker.run(boom)).rejects.toThrow("dependency down");
    await expect(breaker.run(boom)).rejects.toThrow("dependency down");
    expect(breaker.state).toBe("open");

    // The point of the breaker: the dependency is NOT called again.
    const fn = vi.fn(boom);
    await expect(breaker.run(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("counts consecutive failures only", async () => {
    const breaker = createCircuitBreaker(options);
    await expect(breaker.run(boom)).rejects.toThrow();
    await breaker.run(async () => "recovered");
    await expect(breaker.run(boom)).rejects.toThrow();
    // Two failures total, but not in a row — an occasional error among healthy
    // traffic must not accumulate into an outage that never happened.
    expect(breaker.state).toBe("closed");
  });

  it("half-opens after the reset window and closes on a successful trial", async () => {
    vi.useFakeTimers();
    try {
      const breaker = createCircuitBreaker(options);
      await expect(breaker.run(boom)).rejects.toThrow();
      await expect(breaker.run(boom)).rejects.toThrow();

      vi.advanceTimersByTime(1000);
      expect(breaker.state).toBe("half-open");

      await expect(breaker.run(async () => "back")).resolves.toBe("back");
      expect(breaker.state).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-opens on a failed trial with the full timer", async () => {
    vi.useFakeTimers();
    try {
      const breaker = createCircuitBreaker(options);
      await expect(breaker.run(boom)).rejects.toThrow();
      await expect(breaker.run(boom)).rejects.toThrow();

      vi.advanceTimersByTime(1000);
      await expect(breaker.run(boom)).rejects.toThrow("dependency down");
      expect(breaker.state).toBe("open");

      // Half the window is not enough — the trial reset the clock.
      vi.advanceTimersByTime(500);
      expect(breaker.state).toBe("open");
    } finally {
      vi.useRealTimers();
    }
  });
});
