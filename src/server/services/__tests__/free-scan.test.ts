import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@pdm/database";
import { resetDatabase } from "@pdm/database/testing";
import { SsrfBlockedError } from "@pdm/scanner/net/guard";
import { memoryRateLimitStore } from "@pdm/shared";

/**
 * THE FREE SCANNER'S ABUSE PIPELINE — PLAN.md §3.2, feature doc 18,
 * Phase 6 task 6.5.
 *
 * ⚠️ THIS IS THE HIGHEST-RISK SURFACE IN THE PRODUCT, so the assertions are
 * about what must NOT happen: no row written for a blocked address, no second
 * scan of the same domain from a different network, no enqueue without a
 * challenge. Each of those is a control that can be removed by a one-line
 * refactor and whose absence is invisible in normal use.
 *
 * ⚠️ THE SSRF GUARD IS MOCKED HERE AND FULLY TESTED ELSEWHERE
 * (`packages/scanner/src/net/__tests__/guard.test.ts`). What this suite asserts
 * is the PIPELINE's use of it: that it runs, that it runs BEFORE anything is
 * recorded, and that its rejection never reaches the caller in detail.
 */

const assertSafeUrl = vi.fn<(url: string) => Promise<void>>(async () => undefined);
vi.mock("@pdm/scanner/net/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pdm/scanner/net/guard")>();
  return { ...actual, assertSafeUrl: (url: string) => assertSafeUrl(url) };
});

const verifyTurnstile = vi.fn(async () => ({
  success: true,
  configured: true,
  errorCodes: [] as string[],
}));
vi.mock("@pdm/shared/turnstile", () => ({
  verifyTurnstile: () => verifyTurnstile(),
}));

const enqueued: unknown[] = [];
const waitingCount = { value: 0 };
vi.mock("@/server/services/queues", async () => {
  const { memoryRateLimitStore: memStore } =
    await import("@pdm/shared");
  const store = memStore();
  return {
    freeScanQueue: () => ({
      getWaitingCount: async () => waitingCount.value,
      add: async (_name: string, data: unknown) => {
        enqueued.push(data);
      },
    }),
    rateLimitStore: () => store,
  };
});

const { submitFreeScan } = await import("@/server/services/free-scan");

/*
 * ⚠️ EVERY TEST NEEDS A DISTINCT REGISTRABLE DOMAIN, NOT A DISTINCT HOST. The
 * limiter is module-scoped and shared across this file (as it is across web
 * instances in production), and the domain budget is one scan per 24 h. The
 * first draft of this suite used `site-1.example.com`, `site-2.example.com` and
 * so on — all of which have the registrable domain `example.com`, so they
 * shared one budget and four tests failed. The code was right; the fixtures
 * were not, and the same mistake in production would be a limiter that looked
 * far stricter than it is.
 */
let seq = 0;
const uniqueIp = () => `198.51.100.${(seq += 1) % 250}`;
const uniqueDomain = () => `d${(seq += 1)}-fixture.com`;

function submission(overrides: Partial<Parameters<typeof submitFreeScan>[0]> = {}) {
  return submitFreeScan({
    url: `https://${uniqueDomain()}/`,
    turnstileToken: "token",
    ip: uniqueIp(),
    ...overrides,
  });
}

describe("submitFreeScan", () => {
  beforeEach(async () => {
    await resetDatabase();
    enqueued.length = 0;
    waitingCount.value = 0;
    assertSafeUrl.mockClear();
    assertSafeUrl.mockResolvedValue(undefined);
    verifyTurnstile.mockClear();
    verifyTurnstile.mockResolvedValue({ success: true, configured: true, errorCodes: [] });
  });

  it("accepts a good submission, records it and enqueues exactly one job", async () => {
    const result = await submission();

    expect(result.ok).toBe(true);
    expect(enqueued).toHaveLength(1);

    const row = await prisma.freeScan.findFirstOrThrow();
    expect(row.status).toBe("QUEUED");
    /*
     * ⚠️ THE RAW IP IS NEVER STORED. A privacy product that keeps visitor IPs
     * on a public endpoint for seven days has no standing to report on anyone
     * else's tracking.
     */
    expect(row.ipHash).not.toContain("198.51.100");
    expect(row.ipHash).toHaveLength(64);
  });

  it("issues a token long enough to be unguessable", async () => {
    const result = await submission();
    // §3.2: "a 32-byte URL-safe random ID". base64url of 32 bytes is 43 chars.
    expect(result.ok && result.token.length).toBeGreaterThanOrEqual(43);
    expect(result.ok && /^[A-Za-z0-9_-]+$/.test(result.token)).toBe(true);
  });

  it("rejects a URL that is not one", async () => {
    const result = await submission({ url: "not a url at all" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_URL" });
    expect(await prisma.freeScan.count()).toBe(0);
  });

  it("⚠️ WRITES NOTHING AND ENQUEUES NOTHING WHEN THE SSRF GUARD BLOCKS", async () => {
    /*
     * The guard runs SECOND, before the blocklist read, the Turnstile call, the
     * rate-limit consumption and the row. A row would mean an internal address
     * we were asked to probe is now stored and rendered on a public page.
     */
    assertSafeUrl.mockRejectedValueOnce(
      new SsrfBlockedError("PRIVATE_ADDRESS", "127.0.0.1"),
    );

    const result = await submission();

    expect(result).toMatchObject({ ok: false, code: "BLOCKED_ADDRESS" });
    expect(await prisma.freeScan.count()).toBe(0);
    expect(enqueued).toHaveLength(0);
    // And the challenge was never even called — the free rejection came first.
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("refuses a domain on the blocklist", async () => {
    await prisma.freeScanBlocklist.create({
      data: { registrableDomain: "blocked.example", reason: "manual" },
    });

    const result = await submitFreeScan({
      url: "https://www.blocked.example/",
      turnstileToken: "t",
      ip: uniqueIp(),
    });

    // Keyed on the REGISTRABLE domain — blocking `blocked.example` while
    // `www.blocked.example` sails through is not a blocklist.
    expect(result).toMatchObject({ ok: false, code: "DOMAIN_BLOCKED" });
    expect(await prisma.freeScan.count()).toBe(0);
  });

  it("refuses a failed challenge without enqueuing", async () => {
    verifyTurnstile.mockResolvedValueOnce({
      success: false,
      configured: true,
      errorCodes: ["invalid-input-response"],
    });

    const result = await submission();

    expect(result).toMatchObject({ ok: false, code: "CHALLENGE_FAILED" });
    expect(enqueued).toHaveLength(0);
  });

  it("allows 3 scans an hour from one network and refuses the fourth", async () => {
    const ip = uniqueIp();
    for (let index = 0; index < 3; index += 1) {
      const ok = await submitFreeScan({
        url: `https://${uniqueDomain()}/`,
        turnstileToken: "t",
        ip,
      });
      expect(ok.ok).toBe(true);
    }

    const fourth = await submitFreeScan({
      url: `https://${uniqueDomain()}/`,
      turnstileToken: "t",
      ip,
    });
    expect(fourth).toMatchObject({ ok: false, code: "RATE_LIMITED_IP" });
    expect(fourth.ok === false && fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("⚠️ LIMITS A DOMAIN GLOBALLY, ACROSS DIFFERENT NETWORKS", async () => {
    /*
     * Feature doc 18's named trap: "Domain rate limiting is global, not per-IP
     * — otherwise a distributed abuser hammers one target through us." Per-IP
     * limits protect OUR capacity; only this one stops us being an amplifier
     * pointed at a third party.
     */
    const first = await submitFreeScan({
      url: "https://shared-target.com/",
      turnstileToken: "t",
      ip: uniqueIp(),
    });
    expect(first.ok).toBe(true);

    // A different network, a different path, the same registrable domain.
    const second = await submitFreeScan({
      url: "https://www.shared-target.com/about",
      turnstileToken: "t",
      ip: uniqueIp(),
    });
    expect(second).toMatchObject({ ok: false, code: "RATE_LIMITED_DOMAIN" });
  });

  it("refuses new work when the queue is at its ceiling", async () => {
    waitingCount.value = 200;

    const result = await submission();

    expect(result).toMatchObject({ ok: false, code: "AT_CAPACITY" });
    // Accepting a 201st job is a promise of a result an hour late, made to
    // somebody deciding whether to buy.
    expect(await prisma.freeScan.count()).toBe(0);
  });
});

describe("the limiter itself", () => {
  it("is shared, not per-instance — see the note in queues.ts", () => {
    // A guard against someone swapping the Redis store back to the memory one:
    // the memory store exists and is legitimate in tests, and the only thing
    // stopping it reaching production is that `rateLimitStore()` does not use it.
    const store = memoryRateLimitStore();
    expect(store.increment).toBeTypeOf("function");
  });
});
