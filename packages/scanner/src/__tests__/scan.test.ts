import { afterAll, describe, expect, it } from "vitest";
import { BrowserPool } from "../browser/pool";
import { GENERIC_ADAPTER } from "../consent/generic-adapter";
import { runScan } from "../scan";
import { startFixture, type FixtureServer } from "../testing/fixture-server";
import type { NavigationBudget } from "../navigate";
import type { ScanInput } from "../types";

/**
 * FOUR-PHASE ORCHESTRATION against fixtures.
 *
 * The assertions here are the product's core promises, not plumbing:
 *   - a banner with no reject control produces PARTIAL, never a clean verdict
 *   - Accept All and Reject All record DIFFERENT things
 *   - a dead site is FAILED, not "clean"
 *
 * As in phase-runner.test.ts, these drive the browser layer directly: the
 * fixtures are on 127.0.0.1, which the SSRF guard blocks by design.
 */

const FAST = {
  navTimeoutMs: 10_000,
  settleMaxMs: 2_000,
  observeMs: 1_000,
} satisfies NavigationBudget;

const pool = new BrowserPool({ concurrency: 2 });
const servers: FixtureServer[] = [];

async function fixture(id: Parameters<typeof startFixture>[0]) {
  const server = await startFixture(id);
  servers.push(server);
  return server;
}

function input(url: string, overrides: Partial<ScanInput> = {}): ScanInput {
  return {
    scanId: "scan-test",
    websiteId: "site-test",
    agencyId: "agency-test",
    url,
    registrableDomain: "127.0.0.1",
    monitoredPaths: ["/"],
    respectRobots: false,
    blockMedia: true,
    ...overrides,
  };
}

afterAll(async () => {
  await pool.close(10_000);
  await Promise.all(servers.map((server) => server.close()));
});

describe("runScan", () => {
  it("completes all four phases on a banner that offers accept and reject", async () => {
    const server = await fixture("F08");
    const result = await runScan(input(server.origin), {
      pool,
      adapters: [GENERIC_ADAPTER],
      budget: FAST,
    });

    expect(result.phases.map((p) => p.phase)).toEqual([
      "NO_CONSENT",
      "REJECT_ALL",
      "ACCEPT_ALL",
      "WITHDRAW",
    ]);

    const reject = result.phases.find((p) => p.phase === "REJECT_ALL");
    const accept = result.phases.find((p) => p.phase === "ACCEPT_ALL");
    expect(reject?.status).toBe("EXECUTED");
    expect(accept?.status).toBe("EXECUTED");
    expect(reject?.bannerDismissed).toBe(true);

    // The finding the product exists to make: the tracker fires after Accept
    // and does NOT fire after Reject.
    const trackerAfterAccept = accept?.requests.some((r) => r.url.includes("/tracker.js"));
    const trackerAfterReject = reject?.requests.some((r) => r.url.includes("/tracker.js"));
    expect(trackerAfterAccept).toBe(true);
    expect(trackerAfterReject).toBe(false);

    // F08 has no preferences control, so WITHDRAW cannot run — which makes the
    // whole scan PARTIAL. A clean COMPLETED here would be the bug.
    expect(result.status).toBe("PARTIAL");
  });

  it("reports PARTIAL when the banner has NO reject control", async () => {
    const server = await fixture("F10");
    const result = await runScan(
      input(server.origin, { phases: ["NO_CONSENT", "REJECT_ALL"] }),
      { pool, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const reject = result.phases.find((p) => p.phase === "REJECT_ALL");

    // ⚠️ THE MOST IMPORTANT ASSERTION IN THE SUITE. An accept-only banner must
    // never yield "nothing fired after rejection" — we never rejected.
    expect(reject?.status).toBe("UNDETERMINED");
    expect(reject?.errorCode).toBe("CONSENT_BUTTON_NOT_FOUND");
    expect(result.status).toBe("PARTIAL");
  });

  it("finds a reject control inside an open shadow root", async () => {
    const server = await fixture("F09");
    const result = await runScan(
      input(server.origin, { phases: ["REJECT_ALL"] }),
      { pool, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const reject = result.phases[0];
    expect(reject?.status).toBe("EXECUTED");
    // Playwright pierces open shadow roots, so this needs no special selector —
    // the test exists to prove that, because Usercentrics depends on it.
    expect(reject?.actionMethod).not.toBeNull();
  });

  it("records NO consent action for the NO_CONSENT phase", async () => {
    const server = await fixture("F08");
    const result = await runScan(
      input(server.origin, { phases: ["NO_CONSENT"] }),
      { pool, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const phase = result.phases[0];
    expect(phase?.status).toBe("EXECUTED");
    expect(phase?.actionMethod).toBeNull();
    // Doing nothing IS the phase's job, so it completes.
    expect(result.status).toBe("COMPLETED");
  });

  it("stops after the first phase when navigation never succeeds", async () => {
    const server = await fixture("F11");
    const result = await runScan(input(server.origin), {
      pool,
      adapters: [GENERIC_ADAPTER],
      budget: FAST,
    });

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("HTTP_CLIENT_ERROR");
    expect(result.errorPhase).toBe("NO_CONSENT");
    // Three more contexts would have proved the same thing.
    expect(result.phases).toHaveLength(1);
  });

  it("detects the CMP and records it on the scan", async () => {
    const server = await fixture("F08");
    const result = await runScan(
      input(server.origin, { phases: ["REJECT_ALL"] }),
      { pool, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    expect(result.cmp?.cmpId).toBe("generic");
    // A guess must score low — the UI shows the difference between this and a
    // known-CMP match.
    expect(result.cmp?.confidence).toBeLessThan(0.5);
  });

  it("returns every context to the pool", () => {
    expect(pool.stats().activeContexts).toBe(0);
  });
}, 180_000);
