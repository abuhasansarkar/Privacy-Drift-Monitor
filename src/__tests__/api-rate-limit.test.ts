import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryRateLimitStore, type RateLimitStore } from "@pdm/shared";
import { NextResponse } from "next/server";

/**
 * T10 / G-05 — CONTRACT TESTS FOR THE PUBLIC API v1 RATE LIMITER.
 *
 * The limiter signals a breach by THROWING, and the 429 envelope exists only
 * if `withApiErrors` catches that throw. Both halves of that handshake are
 * untestable from a route handler (which needs a database and an API key), so
 * this file tests them directly, against the in-memory store — the same store
 * `rate-limit.ts` documents as the test double for the Redis one.
 *
 * ⚠️ `@/server/services/queues` is mocked because the real one opens a Redis
 * connection at import. The mock returns the memory store; the production
 * wiring (`redisRateLimitStore(connection())`) is one line in `queues.ts` and
 * shares the same `RateLimitStore` interface, so the swap is total.
 */

const store: RateLimitStore = memoryRateLimitStore();

vi.mock("@/server/services/queues", () => ({
  rateLimitStore: () => store,
}));

const {
  ApiRateLimitError,
  apiRateLimitResponse,
  enforceApiRateLimit,
  enforceApiWriteRateLimit,
} = await import("@/server/services/api-rate-limit");
const { withApiErrors } = await import("@/app/api/v1/_lib/with-errors");

/** Bumps a key past its limit, returning the last (rejected) result. */
async function exhaust(fn: (id: string) => Promise<void>, id: string, times: number) {
  for (let i = 0; i < times; i += 1) {
    await fn(id);
  }
}

describe("enforceApiRateLimit (read budget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a fresh key", async () => {
    await expect(enforceApiRateLimit("key-fresh")).resolves.toBeUndefined();
  });

  it("throws ApiRateLimitError after the 301st request in a minute", async () => {
    await exhaust(enforceApiRateLimit, "key-min", 300); // 300/min limit
    await expect(enforceApiRateLimit("key-min")).rejects.toBeInstanceOf(ApiRateLimitError);
  });

  it("does not consume the DAY window while the MINUTE window is refusing", async () => {
    // The header comment promises a client near the limit burns as little of
    // its daily budget on rejected calls as the design allows. Verify it:
    // exhaust the minute window, then count day-window increments.
    await exhaust(enforceApiRateLimit, "key-day", 300);

    let dayIncrements = 0;
    const realIncrement = store.increment.bind(store);
    const spy = vi
      .spyOn(store, "increment")
      .mockImplementation(async (key, windowSeconds) => {
        if (key.includes("api-key-day")) dayIncrements += 1;
        return realIncrement(key, windowSeconds);
      });

    await expect(enforceApiRateLimit("key-day")).rejects.toBeInstanceOf(ApiRateLimitError);
    await expect(enforceApiRateLimit("key-day")).rejects.toBeInstanceOf(ApiRateLimitError);
    expect(dayIncrements).toBe(0); // both refusals stopped at the minute check
    spy.mockRestore();
  });
});

describe("enforceApiWriteRateLimit (write budget)", () => {
  it("allows the 60th write but rejects the 61st", async () => {
    await exhaust(enforceApiWriteRateLimit, "key-write", 60);
    await expect(enforceApiWriteRateLimit("key-write")).rejects.toBeInstanceOf(ApiRateLimitError);
  });

  it("rejects a write path that a read-heavy client would pass", async () => {
    // 100 writes: under the 300/min general limit, over the 60/min write one.
    await exhaust(enforceApiWriteRateLimit, "key-write-only", 60);
    await expect(enforceApiWriteRateLimit("key-write-only")).rejects.toBeInstanceOf(ApiRateLimitError);
    // Same budget on the read path is still fine — the windows are separate.
    await expect(enforceApiRateLimit("key-read-still-ok")).resolves.toBeUndefined();
  });
});

describe("apiRateLimitResponse (the 429 envelope)", () => {
  it("returns 429, RATE_LIMITED code, Retry-After and both header sets", async () => {
    await exhaust(enforceApiRateLimit, "key-env", 300);
    let result: import("@pdm/shared").RateLimitResult | undefined;
    try {
      await enforceApiRateLimit("key-env");
    } catch (error) {
      // The catch clause widens to `unknown`; the module's own error class is
      // what the limiter throws by construction, so the cast carries the
      // `.result` field out.
      result = (error as InstanceType<typeof ApiRateLimitError>).result;
    }
    expect(result).toBeDefined();

    const response = apiRateLimitResponse(new ApiRateLimitError(result!));
    expect(response.status).toBe(429);

    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toBeTruthy();

    // Both the IETF draft fields and the de-facto aliases must travel together.
    for (const h of ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset",
      "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"]) {
      expect(response.headers.get(h), `missing header ${h}`).toBeTruthy();
    }
    expect(response.headers.get("Retry-After")).toBe(response.headers.get("RateLimit-Reset"));
  });
});

describe("withApiErrors ↔ ApiRateLimitError handshake", () => {
  it("maps a thrown ApiRateLimitError to the 429 envelope", async () => {
    await exhaust(enforceApiRateLimit, "key-wrap", 300);

    // A stand-in for a real v1 handler: authenticates, then enforces.
    const handler = withApiErrors(async () => {
      await enforceApiRateLimit("key-wrap");
      return NextResponse.json({ ok: true });
    });

    const response = await handler();
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("does not swallow non-rate-limit errors (they keep their own mapping)", async () => {
    const handler = withApiErrors(async () => {
      throw new Error("database exploded");
    });
    const response = await handler();
    expect(response.status).toBe(500); // generic conversion, NOT the 429 path
  });
});
