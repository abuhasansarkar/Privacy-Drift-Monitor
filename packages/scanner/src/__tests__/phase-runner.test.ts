import { afterAll, describe, expect, it } from "vitest";
import { BrowserPool } from "../browser/pool";
import { runPhase } from "../phase-runner";
import { startFixture, type FixtureServer } from "../testing/fixture-server";
import type { NavigationBudget } from "../navigate";

/**
 * PHASE RUNNER against the fixture server — real Chromium, real HTTP.
 *
 * ⚠️ These fixtures are on 127.0.0.1, which the SSRF guard blocks by design
 * (§10.3). The tests therefore drive the browser layer DIRECTLY. That is the
 * correct separation: the guard is proven by its own vector suite, and the
 * recorder is proven by pages whose behaviour we control. Never merge the two
 * into one helper that "just scans a URL", or these fixtures become a way to
 * reach past the guard.
 *
 * Budgets are shortened so the suite runs in seconds. The production defaults
 * (15s settle, 10s observe) would make this an eight-minute test file.
 */

const FAST: NavigationBudget = {
  navTimeoutMs: 10_000,
  settleMaxMs: 3_000,
  // Must stay above F06's 1.2s deferred tag, or the test would pass by not
  // looking rather than by the observation window working.
  observeMs: 2_000,
};

const pool = new BrowserPool({ concurrency: 2 });
const servers: FixtureServer[] = [];

async function fixture(id: Parameters<typeof startFixture>[0]) {
  const server = await startFixture(id);
  servers.push(server);
  return server;
}

afterAll(async () => {
  await pool.close(10_000);
  await Promise.all(servers.map((server) => server.close()));
});

describe("runPhase — recording", () => {
  it("records a clean page as EXECUTED with only first-party requests", async () => {
    const server = await fixture("F01");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.requests.length).toBeGreaterThan(0);
    expect(result.requests.every((r) => r.isThirdParty === false)).toBe(true);
    expect(result.errorCode).toBeNull();
  });

  it("records a third-party script that fires before consent", async () => {
    const server = await fixture("F03");
    const thirdPartyPort = new URL(server.thirdPartyOrigin).port;

    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    // The finding this product exists to make: a request that happened before
    // anyone was asked.
    const tracker = result.requests.find((r) => r.url.includes("/tracker.js"));
    expect(tracker, "tracker request was not recorded").toBeDefined();
    expect(tracker?.consentPhase).toBe("NO_CONSENT");
    expect(tracker?.status).toBe(200);
    // 127.0.0.1 has no registrable domain, so third-party classification cannot
    // be asserted here — the port proves it came from the other origin.
    expect(tracker?.url).toContain(thirdPartyPort);
  });

  it("records a cookie written before consent", async () => {
    const server = await fixture("F04");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    const ga = result.cookies.filter((c) => c.name === "_ga");
    expect(ga.length).toBeGreaterThan(0);
    // The VALUE is never stored raw for a non-consent cookie (§10.6).
    expect(ga[0]?.valueRaw).toBeNull();
    expect(ga[0]?.valueHash).toBeTruthy();
    expect(ga[0]?.valueLength).toBeGreaterThan(0);
  });

  it("records storage writes, hashed, never raw", async () => {
    const server = await fixture("F05");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    const keys = result.storage.map((entry) => entry.key);
    expect(keys).toContain("_fbp");
    expect(keys).toContain("sid");

    const fbp = result.storage.find((entry) => entry.key === "_fbp");
    expect(fbp?.storageType).toBe("local");
    expect(fbp?.valueHash).toBeTruthy();
    // RecordedStorageEntry has no raw-value field at all — the shape itself is
    // the guarantee, so this asserts the length was measured, not kept.
    expect(fbp?.valueLength).toBeGreaterThan(0);

    const sid = result.storage.find((entry) => entry.key === "sid");
    expect(sid?.storageType).toBe("session");
  });

  it("catches a tag that fires 1.2s late — the observation window earns its keep", async () => {
    const server = await fixture("F06");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    const late = result.requests.find((r) => r.url.includes("/late.js"));
    expect(late, "deferred tag was missed — observation window too short").toBeDefined();
    // It fired after load, which is exactly what makes it easy to miss.
    expect(late?.timestampMs).toBeGreaterThan(1000);
  });

  it("catches a tag bound to scroll", async () => {
    const server = await fixture("F07");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    expect(
      result.requests.some((r) => r.url.includes("/pixel.gif")),
      "scroll-triggered pixel was missed",
    ).toBeDefined();
    expect(result.requests.some((r) => r.url.includes("/pixel.gif"))).toBe(true);
  });

  it("reports FAILED on an HTTP error rather than an empty clean phase", async () => {
    const server = await fixture("F11");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: FAST,
    });

    // The dangerous alternative is EXECUTED with zero requests, which reads
    // downstream as "we looked and the site was clean".
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toBe("HTTP_ERROR");
  });

  it("still EXECUTES a page that never goes network-idle", async () => {
    const server = await fixture("F12");
    const result = await runPhase(pool, {
      phase: "NO_CONSENT",
      url: server.origin,
      registrableDomain: "127.0.0.1",
      budget: { ...FAST, settleMaxMs: 1_000 },
    });

    // A polling page is normal, not a failure — but we did record it.
    expect(result.status).toBe("EXECUTED");
    expect(result.requests.some((r) => r.url.includes("/poll"))).toBe(true);
  });

  it("returns every context to the pool", () => {
    expect(pool.stats().activeContexts).toBe(0);
  });
}, 180_000);
