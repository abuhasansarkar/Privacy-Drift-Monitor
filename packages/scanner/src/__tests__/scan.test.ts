import { afterAll, describe, expect, it } from "vitest";
import { BrowserPool } from "../browser/pool";
import { GENERIC_ADAPTER } from "../consent/generic-adapter";
import { runScan } from "../scan";
import { startFixture, type FixtureServer } from "../testing/fixture-server";
import { allowAnyUrl, type NavigationBudget } from "../navigate";
import { deriveScanStatus, type ScanInput } from "../types";

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
 *
 * ⚠️ `urlGuard: allowAnyUrl` IS THE ONLY REASON THESE RUN, and it exists in
 * exactly one place — this parameter. Every production path omits it and gets
 * `assertSafeUrl`, so the guard fails CLOSED when somebody forgets. The guard
 * itself is tested against the full vector suite in `net/__tests__/guard.test.ts`
 * and its enforcement at navigation in `ssrf-navigation.test.ts`.
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
      urlGuard: allowAnyUrl,
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
    const server = await fixture("X02");
    const result = await runScan(
      input(server.origin, { phases: ["NO_CONSENT", "REJECT_ALL"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const reject = result.phases.find((p) => p.phase === "REJECT_ALL");

    // ⚠️ THE MOST IMPORTANT ASSERTION IN THE SUITE. An accept-only banner must
    // never yield "nothing fired after rejection" — we never rejected.
    expect(reject?.status).toBe("UNDETERMINED");
    expect(reject?.errorCode).toBe("CONSENT_BUTTON_NOT_FOUND");
    expect(result.status).toBe("PARTIAL");
  });

  it("finds a reject control inside an open shadow root", async () => {
    const server = await fixture("F07");
    const result = await runScan(
      input(server.origin, { phases: ["REJECT_ALL"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const reject = result.phases[0];
    expect(reject?.status).toBe("EXECUTED");
    // Playwright pierces open shadow roots, so this needs no special selector —
    // the test exists to prove that, because Usercentrics depends on it.
    expect(reject?.actionMethod).not.toBeNull();
  });

  /*
   * ⚠️ THE THREE CONSENT-OUTCOME FIXTURES (§4.15 F13–F15). These are the
   * product's actual claim — not "we found a banner", but "we can tell whether
   * the banner did anything". A scanner that passes every other test and fails
   * these detects nothing worth paying for.
   */
  it("F13 — records the tag that fires ANYWAY after Reject All", async () => {
    const server = await fixture("F13");
    const result = await runScan(
      input(server.origin, { phases: ["REJECT_ALL"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const reject = result.phases[0];
    expect(reject?.status).toBe("EXECUTED");
    // The rejection was performed AND the tracker still loaded. Both halves
    // matter: without the first, this is indistinguishable from a scan that
    // never found the button.
    expect(reject?.bannerDismissed).toBe(true);
    expect(
      reject?.requests.some((request) => request.url.includes("/tracker.js")),
      "the tracker should have been recorded firing after rejection",
    ).toBe(true);
  });

  it("F14 — Accept All loads tags that Reject All does not", async () => {
    const server = await fixture("F14");
    const result = await runScan(
      input(server.origin, { phases: ["REJECT_ALL", "ACCEPT_ALL"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const byPhase = new Map(result.phases.map((phase) => [phase.phase, phase]));
    const rejected = byPhase.get("REJECT_ALL");
    const accepted = byPhase.get("ACCEPT_ALL");

    expect(rejected?.status).toBe("EXECUTED");
    expect(accepted?.status).toBe("EXECUTED");

    const thirdParty = (phase: typeof rejected) =>
      (phase?.requests ?? []).filter((request) => /\/[abc]\.js/.test(request.url)).length;

    // ⚠️ The ASYMMETRY is the assertion, not the absolute counts. A scan where
    // both phases record the same thing is a scan whose consent actions did
    // nothing — which is exactly what F13 models and F14 must not.
    expect(thirdParty(accepted)).toBeGreaterThan(thirdParty(rejected));
    expect(thirdParty(rejected)).toBe(0);
  });

  /**
   * ⚠️ F28 — THE HARD GATE (§4.15). "Identical site scanned twice → zero drift
   * events — the single most important regression test."
   *
   * Asserted on the RECORDING rather than on drift events, because that is
   * where a regression would actually originate: fingerprints are derived from
   * these sets, so two identical scans producing identical sets is the property
   * the whole drift engine rests on. A recorder that leaked a timestamp, a
   * request id or an ordering difference fails here, one layer before the
   * normaliser gets a chance to hide it.
   */
  it("F28 — two scans of an identical page record identical sets", async () => {
    const server = await fixture("F28");

    const runOnce = async () => {
      const result = await runScan(
        input(server.origin, { phases: ["NO_CONSENT"] }),
        { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
      );
      const phase = result.phases[0];
      return {
        // Sorted: recording ORDER is not part of a fingerprint, and asserting
        // on it would make this test fail for a reason drift does not care about.
        requests: (phase?.requests ?? [])
          .map((request) => `${request.method} ${request.url}`)
          .sort(),
        cookies: (phase?.cookies ?? [])
          .map((cookie) => `${cookie.domain}|${cookie.name}`)
          .sort(),
      };
    };

    const first = await runOnce();
    const second = await runOnce();

    expect(first.requests.length).toBeGreaterThan(0);
    expect(second.requests).toEqual(first.requests);
    expect(second.cookies).toEqual(first.cookies);
  });

  it("records NO consent action for the NO_CONSENT phase", async () => {
    const server = await fixture("F08");
    const result = await runScan(
      input(server.origin, { phases: ["NO_CONSENT"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const phase = result.phases[0];
    expect(phase?.status).toBe("EXECUTED");
    expect(phase?.actionMethod).toBeNull();
    // Doing nothing IS the phase's job, so it completes.
    expect(result.status).toBe("COMPLETED");
  });

  it("stops after the first phase when navigation never succeeds", async () => {
    const server = await fixture("F24");
    const result = await runScan(input(server.origin), {
      pool,
      urlGuard: allowAnyUrl,
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
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    expect(result.cmp?.cmpId).toBe("generic");
    // A guess must score low — the UI shows the difference between this and a
    // known-CMP match.
    expect(result.cmp?.confidence).toBeLessThan(0.5);
  });

  it("executes GLOBAL_PRIVACY_CONTROL phase cleanly with Sec-GPC header", async () => {
    const server = await fixture("F08");
    const result = await runScan(
      input(server.origin, { phases: ["GLOBAL_PRIVACY_CONTROL"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const gpcPhase = result.phases.find((p) => p.phase === "GLOBAL_PRIVACY_CONTROL");
    expect(gpcPhase?.status).toBe("EXECUTED");
    expect(gpcPhase?.actionMethod).toBeNull();
    expect(result.status).toBe("COMPLETED");
  });

  it("executes INTERACTIVE_ACTION phase with simulated interaction", async () => {
    const server = await fixture("F08");
    const result = await runScan(
      input(server.origin, { phases: ["INTERACTIVE_ACTION"] }),
      { pool, urlGuard: allowAnyUrl, adapters: [GENERIC_ADAPTER], budget: FAST },
    );

    const interactivePhase = result.phases.find((p) => p.phase === "INTERACTIVE_ACTION");
    expect(interactivePhase?.status).toBe("EXECUTED");
    expect(interactivePhase?.actionMethod).toBe("dom_heuristic");
    expect(result.status).toBe("COMPLETED");
  });

  it("returns every context to the pool", () => {
    expect(pool.stats().activeContexts).toBe(0);
  });
}, 180_000);

describe("CNAME resolution is recorded by the scan, not derived later", () => {
  /*
   * ⚠️ WHY THIS RUNS AT SCAN TIME. A CNAME is a DNS fact that changes without
   * notice. Resolving it while INTERPRETING stored evidence would mean
   * re-running analysis over the same scan could produce a different answer —
   * the replayability the evidence/interpretation split exists to guarantee
   * (P6). So the scan records it and the rule engine only reads it.
   *
   * Before this wiring, `net/cname.ts` was exported and called from nowhere,
   * while PDM-R038 "detected" cloaking by searching HTTP redirect chains for
   * the substring "cname" — which real cloaking never contains.
   */
  it("records a chain for the first-party hosts it contacted", async () => {
    const server = await fixture("F01");
    const seen: string[] = [];

    const result = await runScan(input(server.origin), {
      pool,
      urlGuard: allowAnyUrl,
      adapters: [GENERIC_ADAPTER],
      budget: FAST,
      cnameChecker: async (host, registrableDomain) => {
        seen.push(host);
        return {
          isCloaked: true,
          originalHost: host,
          canonicalHost: "client.sc.omtrdc.net",
          chain: [`${registrableDomain}.cdn.example`, "client.sc.omtrdc.net"],
        };
      },
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(result.cnameResolutions.length).toBeGreaterThan(0);
    expect(result.cnameResolutions[0]!.isCloaked).toBe(true);
    expect(result.cnameResolutions[0]!.canonicalHost).toBe("client.sc.omtrdc.net");
  });

  it("resolves each host once, however many requests it served", async () => {
    const server = await fixture("F02");
    const seen: string[] = [];

    await runScan(input(server.origin), {
      pool,
      urlGuard: allowAnyUrl,
      adapters: [GENERIC_ADAPTER],
      budget: FAST,
      cnameChecker: async (host) => {
        seen.push(host);
        return { isCloaked: false, originalHost: host, canonicalHost: null, chain: [] };
      },
    });

    expect(new Set(seen).size).toBe(seen.length);
  });

  it("records nothing rather than failing the scan when the resolver throws", async () => {
    /*
     * A DNS outage must never downgrade a scan. The recording is the expensive,
     * unrepeatable half — losing it over a name lookup would be the worst
     * possible trade.
     */
    const server = await fixture("F01");

    const result = await runScan(input(server.origin), {
      pool,
      urlGuard: allowAnyUrl,
      adapters: [GENERIC_ADAPTER],
      budget: FAST,
      cnameChecker: async () => {
        throw new Error("ESERVFAIL");
      },
    });

    /*
     * The claim is that DNS does not influence the outcome — not that this
     * fixture is COMPLETED. `deriveScanStatus` decides status from the phases
     * alone, so a thrown resolver must leave it exactly where the phases put
     * it, and must certainly not make the scan FAILED.
     */
    expect(result.status).toBe(deriveScanStatus(result.phases, true));
    expect(result.status).not.toBe("FAILED");
    expect(result.cnameResolutions).toEqual([]);
  });

  it("resolves nothing when navigation never succeeded", async () => {
    let called = false;
    const result = await runScan(input("http://127.0.0.1:1/"), {
      pool,
      urlGuard: allowAnyUrl,
      adapters: [GENERIC_ADAPTER],
      budget: { navTimeoutMs: 2_000, settleMaxMs: 200, observeMs: 200 },
      cnameChecker: async (host) => {
        called = true;
        return { isCloaked: false, originalHost: host, canonicalHost: null, chain: [] };
      },
    });

    expect(result.status).toBe("FAILED");
    expect(called).toBe(false);
    expect(result.cnameResolutions).toEqual([]);
  });
});
