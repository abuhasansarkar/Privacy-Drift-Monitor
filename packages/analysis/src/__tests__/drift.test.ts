import { describe, expect, it } from "vitest";
import {
  diffScans,
  normalize,
  pickBaseline,
  type ScanFingerprint,
} from "../drift";

/**
 * PRIVACY DRIFT — §4.10.
 *
 * Two failure modes get the most coverage here, because both produce a feed
 * that is confidently wrong rather than obviously broken:
 *   - diffing against a PARTIAL scan, which invents removals
 *   - diffing un-normalized values, which invents drift on an untouched site
 */

function fingerprint(overrides: Partial<ScanFingerprint> = {}): ScanFingerprint {
  return {
    scanId: "scan-1",
    trackers: [],
    cookies: [],
    domains: [],
    cmpId: null,
    healthScore: null,
    ...overrides,
  };
}

describe("baseline selection", () => {
  it("picks the most recent COMPLETED scan", () => {
    const baseline = pickBaseline([
      { scanId: "old", status: "COMPLETED", finishedAt: new Date("2026-08-01") },
      { scanId: "new", status: "COMPLETED", finishedAt: new Date("2026-08-20") },
    ]);
    expect(baseline?.scanId).toBe("new");
  });

  it("SKIPS a more recent PARTIAL scan", () => {
    const baseline = pickBaseline([
      { scanId: "complete", status: "COMPLETED", finishedAt: new Date("2026-08-01") },
      { scanId: "partial", status: "PARTIAL", finishedAt: new Date("2026-08-20") },
    ]);

    /*
     * ⚠️ THE ASSERTION THIS FILE EXISTS FOR. A PARTIAL scan recorded fewer
     * things because journeys did not run — diffing against it reports
     * everything it missed as a removal, and the feed fills with changes that
     * never happened. Schema and §4.10 both state this; here it is enforced.
     */
    expect(baseline?.scanId).toBe("complete");
  });

  it("returns null rather than falling back to a PARTIAL scan", () => {
    const baseline = pickBaseline([
      { scanId: "partial", status: "PARTIAL", finishedAt: new Date("2026-08-20") },
      { scanId: "failed", status: "FAILED", finishedAt: new Date("2026-08-19") },
    ]);

    // No baseline means no drift events: correct and quiet, where phantom
    // drift is wrong and loud.
    expect(baseline).toBeNull();
  });
});

describe("normalization", () => {
  it("collapses a rotating vendor cookie suffix", () => {
    expect(normalize("_gcl_au_1712345678")).toBe(normalize("_gcl_au_1799999999"));
    expect(normalize("_ga_ABC123")).toBe(normalize("_ga_XYZ789"));
  });

  it("collapses a cache-busted bundle name", () => {
    expect(normalize("app.4f2c1a.js")).toBe(normalize("app.8ac31f.js"));
    expect(normalize("main-8ac31f2.css")).toBe(normalize("main-1b2c3d4.css"));
  });

  it("does NOT collapse two genuinely different names", () => {
    // Over-normalizing hides real drift, which is the failure that would make
    // the whole feature quietly useless.
    expect(normalize("_ga")).not.toBe(normalize("_fbp"));
    expect(normalize("analytics.js")).not.toBe(normalize("pixel.js"));
  });

  it("produces no drift for a site that only rotated its identifiers", () => {
    const events = diffScans({
      previous: fingerprint({ cookies: ["_gcl_au_111", "_ga_AAA"] }),
      current: fingerprint({ cookies: ["_gcl_au_222", "_ga_BBB"] }),
    });
    expect(events).toEqual([]);
  });
});

describe("diff — consent regression", () => {
  it("reports a tracker newly firing after Reject All as CRITICAL", () => {
    const events = diffScans({
      previous: fingerprint({ trackers: ["meta-pixel@ACCEPT_ALL"] }),
      current: fingerprint({
        trackers: ["meta-pixel@ACCEPT_ALL", "meta-pixel@REJECT_ALL"],
      }),
    });

    const regression = events.find((e) => e.changeType === "CONSENT_REGRESSION");
    // The control used to honour a rejection and now does not — the single
    // most valuable thing this engine can say.
    expect(regression?.severity).toBe("CRITICAL");
    expect(regression?.addedItems[0]).toContain("meta-pixel");
    expect(regression?.addedItems[0]).toContain("reject all");
  });

  it("separates a plain new tracker from a regression", () => {
    const events = diffScans({
      previous: fingerprint({ trackers: [] }),
      current: fingerprint({
        trackers: ["hotjar@NO_CONSENT", "meta-pixel@REJECT_ALL"],
      }),
    });

    expect(events.find((e) => e.changeType === "TRACKER_ADDED")?.severity).toBe("HIGH");
    expect(
      events.find((e) => e.changeType === "CONSENT_REGRESSION")?.severity,
    ).toBe("CRITICAL");
  });

  it("reports a removed tracker as INFO, not a concern", () => {
    const events = diffScans({
      previous: fingerprint({ trackers: ["hotjar@NO_CONSENT"] }),
      current: fingerprint({ trackers: [] }),
    });

    // Usually the agency's own fix landing. Flagging it as a problem is noise.
    expect(events[0]?.changeType).toBe("TRACKER_REMOVED");
    expect(events[0]?.severity).toBe("INFO");
  });
});

describe("diff — CMP and score", () => {
  it("reports a CMP swap with both values", () => {
    const events = diffScans({
      previous: fingerprint({ cmpId: "cookiebot" }),
      current: fingerprint({ cmpId: "cookieyes" }),
    });

    const event = events.find((e) => e.changeType === "CMP_CHANGED");
    expect(event?.beforeValue).toBe("cookiebot");
    expect(event?.afterValue).toBe("cookieyes");
  });

  it("reports a disappearing banner as HIGH", () => {
    const events = diffScans({
      previous: fingerprint({ cmpId: "cookiebot" }),
      current: fingerprint({ cmpId: null }),
    });
    expect(events[0]?.changeType).toBe("CMP_REMOVED");
    expect(events[0]?.severity).toBe("HIGH");
  });

  it("reports a score DROP but never a rise", () => {
    const dropped = diffScans({
      previous: fingerprint({ healthScore: 90 }),
      current: fingerprint({ healthScore: 60 }),
    });
    const improved = diffScans({
      previous: fingerprint({ healthScore: 60 }),
      current: fingerprint({ healthScore: 90 }),
    });

    expect(dropped[0]?.changeType).toBe("SCORE_DROP");
    expect(dropped[0]?.severity).toBe("HIGH");
    // A feed that celebrates improvements buries the regressions.
    expect(improved).toEqual([]);
  });

  it("ignores a drop below the noise floor", () => {
    const events = diffScans({
      previous: fingerprint({ healthScore: 90 }),
      current: fingerprint({ healthScore: 87 }),
    });
    // One medium finding moves the score by 5; firing on every one of those
    // makes a feed nobody reads.
    expect(events).toEqual([]);
  });

  it("produces nothing at all for two identical scans", () => {
    const same = fingerprint({
      trackers: ["ga4@NO_CONSENT"],
      cookies: ["_ga"],
      domains: ["google-analytics.com"],
      cmpId: "cookiebot",
      healthScore: 80,
    });
    expect(diffScans({ previous: same, current: { ...same, scanId: "scan-2" } })).toEqual(
      [],
    );
  });
});
