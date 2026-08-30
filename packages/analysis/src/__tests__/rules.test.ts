import { describe, expect, it } from "vitest";
import type { ConsentPhase, PhaseResult, PhaseStatus } from "@pdm/scanner/types";
import type { Detection, VendorPattern } from "../classify";
import { evaluateRules, RULES, type Rule, type RuleContext } from "../rules";

/**
 * RULE ENGINE — §4.9.
 *
 * The first test in this file is the one that matters most. Everything else is
 * ordinary coverage; that one is the product's central promise, and it is the
 * bug that would be invisible in production because it produces a REASSURING
 * result rather than an error.
 */

const ga: VendorPattern = {
  id: "vendor-ga",
  slug: "ga",
  name: "Google Analytics 4",
  category: "ANALYTICS",
  riskLevel: "HIGH",
  domainPatterns: [],
  scriptPatterns: [],
  cookiePatterns: [],
  storagePatterns: [],
  requestPathPatterns: [],
  baseConfidence: 0.9,
  isEssentialCandidate: false,
};

const cookiebot: VendorPattern = {
  ...ga,
  id: "vendor-cookiebot",
  name: "Cookiebot",
  category: "CONSENT",
  isEssentialCandidate: true,
};

function phase(
  name: ConsentPhase,
  status: PhaseStatus,
  errorCode: PhaseResult["errorCode"] = null,
): PhaseResult {
  return {
    phase: name,
    status,
    startedAt: new Date(),
    finishedAt: new Date(),
    durationMs: 1000,
    actionMethod: null,
    actionConfidence: null,
    selectorUsed: null,
    elementText: null,
    inIframe: false,
    bannerDismissed: null,
    errorCode,
    errorMessage: null,
    requests: [],
    cookies: [],
    storage: [],
    consoleLogs: [],
    screenshots: [],
  };
}

function detection(
  vendorId: string,
  consentPhase: ConsentPhase,
  corroborated = true,
): Detection {
  return {
    vendorId,
    unknownDomain: null,
    consentPhase,
    firstSeenAtMs: 400,
    requestCount: 1,
    matchedVia: corroborated ? "domain+cookie" : "domain",
    confidence: corroborated ? 0.95 : 0.9,
    corroborated,
    evidenceSummary: {
      hosts: ["www.google-analytics.com"],
      cookies: corroborated ? ["_ga"] : [],
      storageKeys: [],
      signals: corroborated ? ["domain", "cookie"] : ["domain"],
    },
  };
}

function context(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    phases: [phase("NO_CONSENT", "EXECUTED"), phase("REJECT_ALL", "EXECUTED")],
    detections: [],
    vendorsById: new Map([
      ["vendor-ga", ga],
      ["vendor-cookiebot", cookiebot],
    ]),
    requests: [],
    cookies: [],
    storage: [],
    ...overrides,
  };
}

describe("rule engine — the PARTIAL guarantee", () => {
  it("produces NO finding about rejection when Reject All never ran", () => {
    const findings = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED"),
          // The accept-only banner case (fixture F10).
          phase("REJECT_ALL", "UNDETERMINED", "CONSENT_BUTTON_NOT_FOUND"),
        ],
        detections: [],
      }),
    );

    /*
     * ⚠️ THE ASSERTION THIS FILE EXISTS FOR. With no guard, the REJECT_ALL rule
     * sees an empty detection list and reports nothing — and "no findings after
     * rejection" reads downstream and in the UI as "rejection is respected".
     * It is not. We never rejected. Silence here is correct ONLY because
     * PARTIAL carries the message instead (P5).
     */
    expect(findings.filter((f) => f.consentPhase === "REJECT_ALL")).toHaveLength(0);
  });

  it("produces no findings at all when NO_CONSENT never ran", () => {
    const findings = evaluateRules(
      context({
        phases: [phase("NO_CONSENT", "FAILED")],
        detections: [detection("vendor-ga", "NO_CONSENT")],
        cookies: [],
      }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe("rule engine — severity", () => {
  it("raises CRITICAL only on a corroborated detection", () => {
    const [finding] = evaluateRules(
      context({ detections: [detection("vendor-ga", "NO_CONSENT", true)] }),
    );
    expect(finding?.severity).toBe("CRITICAL");
    expect(finding?.rationale).toContain("two independent signals");
  });

  it("caps an uncorroborated detection at HIGH", () => {
    const [finding] = evaluateRules(
      context({ detections: [detection("vendor-ga", "NO_CONSENT", false)] }),
    );
    // One weak signal can never produce a Critical (§4.8, §12.7).
    expect(finding?.severity).toBe("HIGH");
    expect(finding?.rationale).toContain("Review recommended");
  });

  it("does not report a consent platform loading before consent", () => {
    const findings = evaluateRules(
      context({ detections: [detection("vendor-cookiebot", "NO_CONSENT")] }),
    );
    // The CMP script is how the banner reaches the page. Reporting it teaches
    // users to ignore us.
    expect(findings).toHaveLength(0);
  });
});

describe("rule engine — cookies and storage", () => {
  const preConsentCookie = (name: string, thirdParty = false) => ({
    consentPhase: "NO_CONSENT" as ConsentPhase,
    snapshotPoint: "after_settle" as const,
    name,
    domain: thirdParty ? "doubleclick.net" : "acme.test",
    path: "/",
    isSession: false,
    durationDays: 730,
    secure: true,
    httpOnly: false,
    sameSite: "Lax",
    isThirdParty: thirdParty,
    valueHash: "h:x",
    valueLength: 10,
    valueRaw: null,
  });

  it("reports a pre-consent cookie, third-party rated higher", () => {
    const findings = evaluateRules(
      context({ cookies: [preConsentCookie("_ga"), preConsentCookie("_fbp", true)] }),
    );

    const first = findings.find((f) => f.subject === "_ga");
    const third = findings.find((f) => f.subject === "_fbp");
    expect(first?.severity).toBe("MEDIUM");
    expect(third?.severity).toBe("HIGH");
  });

  it("does not report the CMP's own consent cookie", () => {
    const findings = evaluateRules(
      context({
        cookies: [{ ...preConsentCookie("CookieConsent"), valueRaw: "consent-string" }],
      }),
    );
    // `valueRaw` is populated only for allowlisted consent-signal cookies
    // (§10.6) — the mechanism working is not a finding.
    expect(findings).toHaveLength(0);
  });

  it("collapses many storage keys into one finding", () => {
    const entry = (key: string) => ({
      consentPhase: "NO_CONSENT" as ConsentPhase,
      storageType: "local" as const,
      key,
      valueLength: 5,
      valueHash: "h:y",
      origin: "https://acme.test",
    });

    const findings = evaluateRules(
      context({ storage: [entry("a"), entry("b"), entry("c")] }),
    );

    // One script writing eight keys is one behaviour; eight issues would bury
    // everything else on the page.
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidenceRefs.storageKeys).toHaveLength(3);
  });
});

describe("rule engine — fingerprints and precedence", () => {
  it("produces a fingerprint stable across scans", () => {
    const runOnce = () =>
      evaluateRules(context({ detections: [detection("vendor-ga", "NO_CONSENT")] }))[0]
        ?.fingerprint;

    // Two evaluations with different timing must agree, or every nightly scan
    // creates a new issue and deduplication silently does nothing.
    expect(runOnce()).toBe(runOnce());
    expect(runOnce()).not.toContain(String(Date.now()).slice(0, 6));
  });

  it("keeps the higher-precedence rule when two describe the same subject", () => {
    const findings = evaluateRules(
      context({
        detections: [
          detection("vendor-ga", "NO_CONSENT"),
          detection("vendor-ga", "REJECT_ALL"),
        ],
      }),
    );

    // Different phases are different findings, so both survive — the
    // precedence collapse is per subject AND phase.
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      "R01_TRACKER_BEFORE_CONSENT",
      "R02_TRACKER_AFTER_REJECT",
    ]);
  });

  it("keeps other rules' findings when one rule throws", () => {
    const exploding: Rule = {
      id: "R99_BROKEN",
      category: "CONSENT_MISSING",
      precedence: 999,
      evaluate() {
        throw new Error("bad predicate");
      },
    };

    const findings = evaluateRules(
      context({ detections: [detection("vendor-ga", "NO_CONSENT")] }),
      // Broken rule FIRST: a `flatMap` without the per-rule catch loses
      // everything after it, turning a tuning mistake into a scan that reports
      // nothing at all.
      [exploding, ...RULES],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("R01_TRACKER_BEFORE_CONSENT");
  });
});
