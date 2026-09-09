import "server-only";
import { NextResponse } from "next/server";
import {
  checkRateLimit,
  rateLimitHeaders,
  rateLimitKey,
  type RateLimitResult,
} from "@pdm/shared";
import { rateLimitStore } from "@/server/services/queues";

/**
 * PUBLIC API v1 RATE LIMITING — NEW-PLAN.md gap G-05 / dev-doc/tasks/T10.
 *
 * The v1 surface authenticates with a bearer `pdm_live_` key, but until now
 * authentication was the only control: a script looping on one key could hold
 * the database and every browser slot it indirectly queued work against, and
 * the API's own docs promised "documented rate limits" that did not exist.
 *
 * ⚠️ KEYED BY API KEY ID, NOT BY IP. The caller is authenticated and known —
 * rate limiting by IP would both punish several integrations behind one NAT
 * gateway and let one agency multiply its budget across many addresses. The
 * key id is the unit that was provisioned, so it is the unit that is limited.
 *
 * ⚠️ REDIS, NOT MEMORY, via the same shared store as the free scanner — a
 * per-instance counter is not a limit (see `rateLimit.ts` and `queues.ts`).
 *
 * Rules: 300 requests / minute and 10,000 requests / day per key. Generous by
 * design — this defends against runaway scripts, not legitimate polling; the
 * GitHub Action polls a scan every 4 seconds for up to 3 minutes and fits
 * easily inside the minute window.
 */
const PER_MINUTE = { limit: 300, windowSeconds: 60 };
const PER_DAY = { limit: 10_000, windowSeconds: 86_400 };

/**
 * A SECOND, tighter budget for state-changing calls. Reads are cheap and
 * idempotent; a `POST …/scans` costs a real browser slot, and the T10 trap
 * named exactly this: one customer's `for` loop filling the scan queue starves
 * every other tenant. Scans are also quota-gated separately by entitlements
 * (`checkScanQuota`) — these limits defend capacity, that one defends plan
 * fairness, and neither substitutes for the other.
 */
const WRITE_PER_MINUTE = { limit: 60, windowSeconds: 60 };

export class ApiRateLimitError extends Error {
  readonly result: RateLimitResult;

  constructor(result: RateLimitResult) {
    super("API rate limit exceeded");
    this.name = "ApiRateLimitError";
    this.result = result;
  }
}

/**
 * Consumes one unit against both windows for `apiKeyId`.
 *
 * Throws `ApiRateLimitError` on breach rather than returning a Response, so a
 * handler cannot accidentally forget to enforce it — the error propagates
 * through `withApiErrors` (mapped below) or the handler's own catch.
 *
 * The minute window is checked first so a client near the limit burns as
 * little of its daily budget on rejected calls as the design allows (the
 * limiter's consume-on-every-call rule keeps a hammering client pinned, but
 * does not double-charge the day window when the minute window already
 * refused).
 */
export async function enforceApiRateLimit(apiKeyId: string): Promise<void> {
  const store = rateLimitStore();
  const minute = await checkRateLimit(
    store,
    rateLimitKey("api-key-min", apiKeyId),
    PER_MINUTE,
  );
  if (!minute.allowed) throw new ApiRateLimitError(minute);

  const day = await checkRateLimit(store, rateLimitKey("api-key-day", apiKeyId), PER_DAY);
  if (!day.allowed) throw new ApiRateLimitError(day);
}

/**
 * The write-path budget: the per-key general limits PLUS a tighter window.
 * Used by every endpoint that enqueues work rather than reading it.
 */
export async function enforceApiWriteRateLimit(apiKeyId: string): Promise<void> {
  await enforceApiRateLimit(apiKeyId);
  const write = await checkRateLimit(
    rateLimitStore(),
    rateLimitKey("api-key-write", apiKeyId),
    WRITE_PER_MINUTE,
  );
  if (!write.allowed) throw new ApiRateLimitError(write);
}

/**
 * The 429 envelope, with standard `RateLimit-*` headers and `Retry-After`.
 * Shape matches the v1 error contract in `_lib/with-errors.ts`.
 */
export function apiRateLimitResponse(error: ApiRateLimitError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "API rate limit exceeded for this key. Retry later.",
      },
    },
    {
      status: 429,
      headers: rateLimitHeaders(error.result),
    },
  );
}

/** Convenience wrapper for handlers that do not use `withApiErrors`. */
export async function withApiRateLimit(
  apiKeyId: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    await enforceApiRateLimit(apiKeyId);
    return await handler();
  } catch (error) {
    if (error instanceof ApiRateLimitError) return apiRateLimitResponse(error);
    throw error;
  }
}
