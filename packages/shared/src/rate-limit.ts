/**
 * RATE LIMITING — PLAN.md Part X §10.4 (abuse control), Phase 0 task 0.4.
 *
 * A fixed-window counter over a pluggable store. Fixed window rather than a
 * sliding log because the store is Redis in production and a window is two
 * commands (`INCR` + `EXPIRE`) against one key, where a log is a sorted set
 * that grows with traffic — and the burst a fixed window lets through at a
 * boundary is not a threat model that matters for "3 free scans an hour".
 *
 * ⚠️ THIS MODULE HOLDS NO STATE ITSELF. It is deliberately store-agnostic so
 * the free public scanner (§6.9) can share one limiter across every web
 * instance via Redis, while tests use the in-memory store. A limiter that kept
 * counts in process memory would reset on deploy and be per-instance, which is
 * not a limit — it is a suggestion.
 */

export interface RateLimitStore {
  /**
   * Increments the counter for `key` and returns the new value. Sets the TTL on
   * FIRST increment only, so the window starts with the first request rather
   * than sliding forward on every one.
   */
  increment(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number }>;
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets — the value for `Retry-After`. */
  resetSeconds: number;
}

/**
 * In-memory store. Tests and single-process development only.
 *
 * Never use this in production: counts are per-instance and vanish on deploy.
 * The Redis store lands with the worker in Phase 2 (§7.1) and implements the
 * same two-line interface.
 */
export function memoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, { count: number; expiresAt: number }>();

  return {
    async increment(key, windowSeconds) {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || existing.expiresAt <= now) {
        const expiresAt = now + windowSeconds * 1000;
        windows.set(key, { count: 1, expiresAt });
        return { count: 1, ttlSeconds: windowSeconds };
      }

      existing.count += 1;
      return {
        count: existing.count,
        ttlSeconds: Math.ceil((existing.expiresAt - now) / 1000),
      };
    },
  };
}

/**
 * Checks and consumes one unit against `rule`.
 *
 * ⚠️ Consuming on every call, allowed or not, is intentional: a client that
 * keeps hammering after a 429 keeps its window open rather than getting a fresh
 * one the moment it expires.
 */
export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const { count, ttlSeconds } = await store.increment(key, rule.windowSeconds);
  return {
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetSeconds: ttlSeconds,
  };
}

/**
 * The response headers a rate-limited endpoint must send (§6.3: "documented
 * rate limits"). `Retry-After` is only meaningful on a rejection.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSeconds),
    ...(result.allowed ? {} : { "Retry-After": String(result.resetSeconds) }),
  };
}

/**
 * Builds a limiter key. Namespaced so two features cannot collide on the same
 * identifier — `scan:1.2.3.4` and `login:1.2.3.4` are different budgets.
 */
export function rateLimitKey(namespace: string, identifier: string): string {
  return `ratelimit:${namespace}:${identifier}`;
}

/**
 * A minimal Redis surface — INCR plus the two TTL commands.
 *
 * ⚠️ STRUCTURAL, NOT `ioredis`. `@pdm/shared` is imported by the web app, the
 * worker and every package; taking a hard dependency on a Redis client here
 * would drag it into the report renderer and the pure analysis packages, which
 * is how a "shared" package becomes a runtime nobody can test. Any client with
 * these three methods satisfies it — ioredis does, and so does a fake.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

/**
 * The production store: one shared window across every web instance.
 *
 * ⚠️ THE TTL IS SET ONLY ON THE FIRST INCREMENT, and that is the whole
 * correctness argument. Calling `EXPIRE` on every request slides the window
 * forward with the traffic, so a client making one request per second never
 * reaches the end of its window and is never reset — the limit becomes
 * permanent rather than periodic. `INCR` returning 1 is the signal that this
 * request created the key.
 *
 * ⚠️ A KEY WITHOUT A TTL IS REPAIRED, NOT TRUSTED. If a process died between
 * the `INCR` and the `EXPIRE`, the counter would persist forever and lock that
 * identifier out permanently — one crash, one IP banned for the life of the
 * Redis instance. `ttl < 0` means "no expiry set", and the fix is to set it.
 */
export function redisRateLimitStore(client: RedisLike): RateLimitStore {
  return {
    async increment(key, windowSeconds) {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, windowSeconds);
        return { count, ttlSeconds: windowSeconds };
      }

      const ttl = await client.ttl(key);
      if (ttl < 0) {
        await client.expire(key, windowSeconds);
        return { count, ttlSeconds: windowSeconds };
      }
      return { count, ttlSeconds: ttl };
    },
  };
}
