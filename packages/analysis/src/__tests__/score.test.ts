import { describe, expect, it } from "vitest";
import type { ConsentPhase, PhaseResult, PhaseStatus } from "@pdm/scanner/types";
import { assertConsistent, bandFor, computeScore } from "../score";
import type { Finding, Severity } from "../rules";

/**
 * HEALTH SCORE — §4.12.
 *
 * Two properties carry the whole design, and both are asserted below:
 *   - the breakdown SUMS to the displayed score, always
 *   - an incomplete scan cannot score as if it were clean
 */

function finding(severity: Severity, id: string): Finding {
  return {
    ruleId: "R01_TRACKER_BEFORE_CONSENT",
    category: "PRE_CONSENT_TRACKING",
    severity,
    fingerprint: id,
    title: `finding ${id}`,
    subject: id,
    consentPhase: "NO_CONSENT",
    evidenceRefs: { requestUrls: [], cookieNames: [], storageKeys: [] },
    rationale: "test",
    recommendedAction: "test",
  };
}

function phase(name: ConsentPhase, status: PhaseStatus): PhaseResult {
  return {
    phase: name,
    status,
    startedAt: new Date(),
    finishedAt: new Date(),
    durationMs: 1,
    actionMethod: null,
    actionConfidence: null,
    selectorUsed: null,
    elementText: null,
    inIframe: false,
    bannerDismissed: null,
    errorCode: null,
    errorMessage: null,
    requests: [],
    cookies: [],
    storage: [],
    consoleLogs: [],
    screenshots: [],
  };
}

const allRan: PhaseResult[] = [
  phase("NO_CONSENT", "EXECUTED"),
  phase("REJECT_ALL", "EXECUTED"),
  phase("ACCEPT_ALL", "EXECUTED"),
  phase("WITHDRAW", "EXECUTED"),
];

describe("health score", () => {
  it("scores a clean complete scan 100 with FULL confidence", () => {
    const result = computeScore({ findings: [], phases: allRan });
    expect(result.score).toBe(100);
    expect(result.confidence).toBe("FULL");
    expect(result.band).toBe("EXCELLENT");
    expect(result.breakdown).toHaveLength(0);
  });

  it("deducts per severity and explains each deduction", () => {
    const result = computeScore({
      findings: [finding("CRITICAL", "a"), finding("MEDIUM", "b")],
      phases: allRan,
    });

    expect(result.score).toBe(100 - 25 - 5);
    const critical = result.breakdown.find((c) => c.component === "severity:CRITICAL");
    expect(critical?.penalty).toBe(25);
    // The "why 64?" answer has to be renderable verbatim.
    expect(critical?.reason).toContain("1 critical potential issue");
    expect(critical?.findingRefs).toEqual(["a"]);
  });

  it("caps the deduction per severity", () => {
    // Ten criticals would otherwise take the score to -150.
    const result = computeScore({
      findings: Array.from({ length: 10 }, (_, i) => finding("CRITICAL", `c${i}`)),
      phases: allRan,
    });

    expect(result.score).toBe(50);
    expect(result.breakdown[0]?.penalty).toBe(50);
  });

  it("keeps a site with many mediums above a site with one critical", () => {
    const manyMedium = computeScore({
      findings: Array.from({ length: 12 }, (_, i) => finding("MEDIUM", `m${i}`)),
      phases: allRan,
    });
    const oneCritical = computeScore({
      findings: [finding("CRITICAL", "x")],
      phases: allRan,
    });

    // The design intent, stated as a test: severity outranks volume.
    expect(manyMedium.score).toBeGreaterThan(oneCritical.score);
  });

  it("ignores INFO findings", () => {
    const result = computeScore({ findings: [finding("INFO", "i")], phases: allRan });
    expect(result.score).toBe(100);
  });
});

describe("health score — the PARTIAL guarantee", () => {
  it("caps an incomplete scan even when it produced no findings", () => {
    const result = computeScore({
      findings: [],
      phases: [
        phase("NO_CONSENT", "EXECUTED"),
        // The accept-only banner (fixture F10).
        phase("REJECT_ALL", "UNDETERMINED"),
      ],
    });

    /*
     * ⚠️ THE ASSERTION THIS FILE EXISTS FOR. Without the ceiling, a site whose
     * Reject All journey never ran scores a clean 100 — because the rules that
     * would have found something were never able to run. That is the exact
     * shape of the failure P5 forbids.
     */
    expect(result.score).toBe(75);
    expect(result.confidence).toBe("PARTIAL");
    expect(result.band).toBe("GOOD");

    const ceiling = result.breakdown.find((c) => c.component === "incomplete-scan");
    expect(ceiling?.reason).toContain("REJECT_ALL");
  });

  it("does not raise a low score back up to the ceiling", () => {
    const result = computeScore({
      findings: [finding("CRITICAL", "a"), finding("CRITICAL", "b")],
      phases: [phase("NO_CONSENT", "EXECUTED"), phase("REJECT_ALL", "UNDETERMINED")],
    });

    // Already 50, which is below the cap — the ceiling only ever lowers.
    expect(result.score).toBe(50);
    expect(result.confidence).toBe("PARTIAL");
    expect(
      result.breakdown.some((c) => c.component === "incomplete-scan"),
    ).toBe(false);
  });
});

describe("health score — the breakdown invariant", () => {
  it("always sums to the displayed score", () => {
    const cases = [
      { findings: [], phases: allRan },
      { findings: [finding("HIGH", "a")], phases: allRan },
      {
        findings: [finding("CRITICAL", "a"), finding("HIGH", "b"), finding("LOW", "c")],
        phases: allRan,
      },
      {
        findings: [finding("MEDIUM", "a")],
        phases: [phase("NO_CONSENT", "EXECUTED"), phase("WITHDRAW", "UNDETERMINED")],
      },
    ];

    for (const input of cases) {
      const result = computeScore(input);
      const deducted = result.breakdown.reduce((sum, c) => sum + c.penalty, 0);
      expect(100 - deducted).toBe(result.score);
    }
  });

  it("throws rather than showing arithmetic that does not work", () => {
    expect(() =>
      assertConsistent({
        score: 90,
        confidence: "FULL",
        band: "EXCELLENT",
        breakdown: [
          { component: "severity:HIGH", penalty: 12, reason: "x", findingRefs: [] },
        ],
      }),
    ).toThrow(/does not sum/);
  });

  it("maps bands to the §11.3 boundaries", () => {
    expect(bandFor(100)).toBe("EXCELLENT");
    expect(bandFor(90)).toBe("EXCELLENT");
    expect(bandFor(89)).toBe("GOOD");
    expect(bandFor(75)).toBe("GOOD");
    expect(bandFor(74)).toBe("FAIR");
    expect(bandFor(50)).toBe("FAIR");
    expect(bandFor(49)).toBe("POOR");
    expect(bandFor(25)).toBe("POOR");
    expect(bandFor(24)).toBe("CRITICAL");
    expect(bandFor(0)).toBe("CRITICAL");
  });
});
