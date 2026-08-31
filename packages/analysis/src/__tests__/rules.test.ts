import { describe, expect, it } from "vitest";
import type {
  ConsentPhase,
  PhaseResult,
  PhaseStatus,
  RecordedCookie,
  RecordedRequest,
  RecordedStorageEntry,
} from "@pdm/scanner/types";
import type { Detection, VendorPattern } from "../classify";
import {
  DRIFT_RULES,
  evaluateDriftRules,
  evaluateRules,
  RULES,
  SCAN_RULES,
  type DriftFact,
  type Rule,
  type RuleContext,
  type ScanFacts,
} from "../rules";

/**
 * RULE ENGINE — §4.11.
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

const meta: VendorPattern = {
  ...ga,
  id: "vendor-meta",
  name: "Meta Pixel",
  category: "MARKETING",
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
  overrides: Partial<PhaseResult> = {},
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
    errorCode: null,
    errorMessage: null,
    requests: [],
    cookies: [],
    storage: [],
    consoleLogs: [],
    screenshots: [],
    ...overrides,
  };
}

function detection(
  vendorId: string | null,
  consentPhase: ConsentPhase,
  overrides: Partial<Detection> = {},
): Detection {
  return {
    vendorId,
    unknownDomain: vendorId ? null : "weird-analytics.example",
    consentPhase,
    firstSeenAtMs: 400,
    requestCount: 1,
    matchedVia: "domain+cookie",
    confidence: 0.95,
    corroborated: true,
    evidenceSummary: {
      hosts: ["www.google-analytics.com"],
      cookies: ["_ga"],
      storageKeys: [],
      signals: ["domain", "cookie"],
    },
    ...overrides,
  };
}

function cookie(overrides: Partial<RecordedCookie> = {}): RecordedCookie {
  return {
    consentPhase: "NO_CONSENT",
    snapshotPoint: "phase_end",
    name: "_ga",
    domain: ".example.test",
    path: "/",
    isSession: false,
    durationDays: 400,
    secure: true,
    httpOnly: false,
    sameSite: "Lax",
    isThirdParty: true,
    valueHash: "abc",
    valueLength: 12,
    valueRaw: null,
    ...overrides,
  };
}

function request(overrides: Partial<RecordedRequest> = {}): RecordedRequest {
  return {
    pageUrl: "https://example.test/",
    consentPhase: "NO_CONSENT",
    url: "https://fonts.example/css",
    method: "GET",
    resourceType: "font",
    host: "fonts.example",
    registrableDomain: "fonts.example",
    isThirdParty: true,
    status: 200,
    failureText: null,
    initiatorType: "css",
    initiatorUrl: null,
    timestampMs: 300,
    transferSize: 1000,
    redirectChain: [],
    setCookieCount: 0,
    ...overrides,
  };
}

function storage(overrides: Partial<RecordedStorageEntry> = {}): RecordedStorageEntry {
  return {
    consentPhase: "NO_CONSENT",
    storageType: "local",
    key: "_fbp",
    valueLength: 20,
    valueHash: "def",
    origin: "https://example.test",
    ...overrides,
  };
}

function scanFacts(overrides: Partial<ScanFacts> = {}): ScanFacts {
  return {
    status: "COMPLETED",
    errorCode: null,
    url: "https://example.test/",
    consecutiveFailures: 0,
    cmpId: null,
    cmpName: null,
    ...overrides,
  };
}

function drift(overrides: Partial<DriftFact> = {}): DriftFact {
  return {
    changeType: "TRACKER_ADDED",
    severity: "HIGH",
    summary: "Meta Pixel was not present on the previous scan.",
    subject: "Meta Pixel",
    preConsent: false,
    ...overrides,
  };
}

function context(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    phases: [phase("NO_CONSENT", "EXECUTED"), phase("REJECT_ALL", "EXECUTED")],
    detections: [],
    vendorsById: new Map([
      ["vendor-ga", ga],
      ["vendor-meta", meta],
      ["vendor-cookiebot", cookiebot],
    ]),
    requests: [],
    cookies: [],
    storage: [],
    scan: scanFacts(),
    ...overrides,
  };
}

const idsOf = (findings: { ruleId: string }[]) => findings.map((f) => f.ruleId).sort();

/* ────────────────────────────────────────────────────────────────────────── */

describe("rule engine — the PARTIAL guarantee", () => {
  it("produces NO finding about rejection when Reject All never ran", () => {
    const findings = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED"),
          // The accept-only banner case (fixture X02).
          phase("REJECT_ALL", "UNDETERMINED", { errorCode: "CONSENT_BUTTON_NOT_FOUND" }),
        ],
        detections: [detection("vendor-meta", "REJECT_ALL")],
      }),
    );

    /*
     * ⚠️ THE ASSERTION THIS FILE EXISTS FOR. With no guard, the REJECT_ALL
     * rules see an empty detection list and report nothing — and "no findings
     * after rejection" reads downstream and in the UI as "rejection is
     * respected". It is not. We never rejected.
     */
    expect(idsOf(findings)).not.toContain("PDM-R004");
    expect(idsOf(findings)).not.toContain("PDM-R005");
    // What we DO report is that we could not test it.
    expect(idsOf(findings)).toContain("PDM-R012");
    expect(idsOf(findings)).toContain("PDM-R024");
  });
});

describe("§4.11 coverage", () => {
  it("implements all twenty-five planned rules", () => {
    const planned = Array.from(
      { length: 25 },
      (_unused, index) => `PDM-R${String(index + 1).padStart(3, "0")}`,
    );
    const implemented = new Set(RULES.map((rule) => rule.id));
    const missing = planned.filter((id) => !implemented.has(id));
    expect(missing, `missing rules: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps our own rules out of the plan's numbering", () => {
    const ours = RULES.filter((rule) => rule.id.startsWith("PDM-X"));
    expect(ours.length).toBeGreaterThan(0);
    for (const rule of ours) expect(rule.id).not.toMatch(/^PDM-R\d/);
  });

  it("gives every rule a unique id and a precedence", () => {
    expect(new Set(RULES.map((rule) => rule.id)).size).toBe(RULES.length);
    for (const rule of RULES) expect(rule.precedence).toBeGreaterThan(0);
  });

  it("separates the drift pass from the evidence pass", () => {
    const scanIds = new Set(SCAN_RULES.map((rule) => rule.id));
    for (const rule of DRIFT_RULES) {
      expect(scanIds.has(rule.id), `${rule.id} is in both passes`).toBe(false);
    }
  });

  it("ranks every consent finding above every hygiene finding", () => {
    // A font CDN must never outrank "your rejection does nothing".
    const consent = RULES.find((rule) => rule.id === "PDM-R004")?.precedence ?? 0;
    const hygiene = RULES.find((rule) => rule.id === "PDM-R020")?.precedence ?? 0;
    expect(consent).toBeGreaterThan(hygiene);
  });
});

describe("pre-consent rules", () => {
  it("R001 is Critical for a corroborated MARKETING tracker", () => {
    const findings = evaluateRules(
      context({ detections: [detection("vendor-meta", "NO_CONSENT")] }),
    );
    const finding = findings.find((f) => f.ruleId === "PDM-R001");
    expect(finding?.severity).toBe("CRITICAL");
    expect(finding?.title).toContain("Meta Pixel");
  });

  it("R001 steps down to High on a single signal", () => {
    // ⚠️ §4.8: a wrong Critical costs trust in everything else we report.
    const findings = evaluateRules(
      context({
        detections: [
          detection("vendor-meta", "NO_CONSENT", {
            corroborated: false,
            matchedVia: "domain",
          }),
        ],
      }),
    );
    expect(findings.find((f) => f.ruleId === "PDM-R001")?.severity).toBe("HIGH");
  });

  it("R002 is High for analytics, not Critical", () => {
    const findings = evaluateRules(
      context({ detections: [detection("vendor-ga", "NO_CONSENT")] }),
    );
    const finding = findings.find((f) => f.ruleId === "PDM-R002");
    expect(finding?.severity).toBe("HIGH");
  });

  it("ignores an essential vendor firing pre-consent", () => {
    // The consent banner's own script has to load before consent.
    const findings = evaluateRules(
      context({ detections: [detection("vendor-cookiebot", "NO_CONSENT")] }),
    );
    expect(idsOf(findings)).not.toContain("PDM-R001");
    expect(idsOf(findings)).not.toContain("PDM-R002");
  });

  it("R003 reports an unrecognised third party without calling it a tracker", () => {
    const findings = evaluateRules(
      context({ detections: [detection(null, "NO_CONSENT")] }),
    );
    const finding = findings.find((f) => f.ruleId === "PDM-R003");
    expect(finding?.severity).toBe("MEDIUM");
    expect(finding?.title.toLowerCase()).not.toContain("tracker");
  });
});

describe("consent-failure rules", () => {
  it("R004 fires when a marketing tag survives Reject All", () => {
    const findings = evaluateRules(
      context({ detections: [detection("vendor-meta", "REJECT_ALL")] }),
    );
    expect(findings.find((f) => f.ruleId === "PDM-R004")?.severity).toBe("CRITICAL");
  });

  it("R006 fires for a cookie that survived Reject All", () => {
    const findings = evaluateRules(
      context({ cookies: [cookie({ consentPhase: "REJECT_ALL" })] }),
    );
    expect(findings.find((f) => f.ruleId === "PDM-R006")?.severity).toBe("HIGH");
  });

  it("R007 and R008 need the withdraw phase to have run", () => {
    const withoutWithdraw = evaluateRules(
      context({
        detections: [detection("vendor-meta", "WITHDRAW")],
        cookies: [cookie({ consentPhase: "WITHDRAW" })],
      }),
    );
    expect(idsOf(withoutWithdraw)).not.toContain("PDM-R007");
    expect(idsOf(withoutWithdraw)).not.toContain("PDM-R008");

    const withWithdraw = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED"),
          phase("REJECT_ALL", "EXECUTED"),
          phase("WITHDRAW", "EXECUTED"),
        ],
        detections: [detection("vendor-meta", "WITHDRAW")],
        cookies: [cookie({ consentPhase: "WITHDRAW" })],
      }),
    );
    expect(idsOf(withWithdraw)).toContain("PDM-R007");
    expect(idsOf(withWithdraw)).toContain("PDM-R008");
  });

  it("R009 needs BOTH no banner and actual trackers", () => {
    const noBannerNoTrackers = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED", { errorCode: "CONSENT_NO_BANNER_FOUND" }),
        ],
      }),
    );
    // A site with no banner and no tracking has nothing to consent to.
    expect(idsOf(noBannerNoTrackers)).not.toContain("PDM-R009");

    const noBannerWithTrackers = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED", { errorCode: "CONSENT_NO_BANNER_FOUND" }),
        ],
        detections: [detection("vendor-meta", "NO_CONSENT")],
      }),
    );
    expect(idsOf(noBannerWithTrackers)).toContain("PDM-R009");
  });
});

describe("scanner-limitation rules are worded as ours", () => {
  it("R010 says WE could not, not that the site is wrong", () => {
    const findings = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED", { errorCode: "CONSENT_BANNER_TIMEOUT" }),
        ],
        scan: scanFacts({ cmpId: "cookiebot", cmpName: "Cookiebot" }),
      }),
    );
    const finding = findings.find((f) => f.ruleId === "PDM-R010");
    expect(finding).toBeDefined();
    expect(finding?.title.toLowerCase()).toContain("we ");
  });

  it("R011 fires only when reject needed the preferences panel", () => {
    const direct = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED"),
          phase("REJECT_ALL", "EXECUTED", { actionMethod: "accessible_name" }),
        ],
      }),
    );
    expect(idsOf(direct)).not.toContain("PDM-R011");

    const viaPanel = evaluateRules(
      context({
        phases: [
          phase("NO_CONSENT", "EXECUTED"),
          phase("REJECT_ALL", "EXECUTED", { actionMethod: "preferences_fallback" }),
        ],
      }),
    );
    expect(idsOf(viaPanel)).toContain("PDM-R011");
  });
});

describe("drift rules", () => {
  it("produce nothing without a drift pass", () => {
    expect(evaluateDriftRules(context())).toEqual([]);
  });

  it("R013 is Critical when the new tracker fired pre-consent", () => {
    const gated = evaluateDriftRules(context({ drift: [drift()] }));
    expect(gated[0]?.ruleId).toBe("PDM-R013");
    expect(gated[0]?.severity).toBe("HIGH");

    const ungated = evaluateDriftRules(
      context({ drift: [drift({ preConsent: true })] }),
    );
    expect(ungated[0]?.severity).toBe("CRITICAL");
  });

  it("R017 consent regression is always Critical", () => {
    const findings = evaluateDriftRules(
      context({
        drift: [
          drift({
            changeType: "CONSENT_REGRESSION",
            subject: "Meta Pixel",
            summary: "Reject All previously blocked this and no longer does.",
          }),
        ],
      }),
    );
    expect(findings[0]?.ruleId).toBe("PDM-R017");
    expect(findings[0]?.severity).toBe("CRITICAL");
  });

  it("R016 is Low unless the new domain was contacted pre-consent", () => {
    const after = evaluateDriftRules(
      context({ drift: [drift({ changeType: "THIRD_PARTY_DOMAIN_ADDED" })] }),
    );
    expect(after[0]?.severity).toBe("LOW");

    const before = evaluateDriftRules(
      context({
        drift: [drift({ changeType: "THIRD_PARTY_DOMAIN_ADDED", preConsent: true })],
      }),
    );
    expect(before[0]?.severity).toBe("MEDIUM");
  });

  it("fingerprints on the subject, not the scan — so it does not realert nightly", () => {
    const first = evaluateDriftRules(context({ drift: [drift()] }));
    const second = evaluateDriftRules(context({ drift: [drift()] }));
    expect(second[0]?.fingerprint).toBe(first[0]?.fingerprint);
  });
});

describe("hygiene rules", () => {
  it("R020 stays Low for a font CDN", () => {
    const findings = evaluateRules(context({ requests: [request()] }));
    const finding = findings.find((f) => f.ruleId === "PDM-R020");
    expect(finding?.severity).toBe("LOW");
  });

  it("R021 is Info and needs a lifetime over thirteen months", () => {
    const short = evaluateRules(context({ cookies: [cookie({ durationDays: 90 })] }));
    expect(idsOf(short)).not.toContain("PDM-R021");

    /*
     * ⚠️ Asserted in the ACCEPT_ALL phase deliberately. In NO_CONSENT the same
     * cookie also trips PDM-X01 ("set before consent", High), and precedence
     * collapses the two into the more serious one — which is correct, and is
     * asserted on its own below.
     */
    const long = evaluateRules(
      context({
        cookies: [
          cookie({ name: "_long", durationDays: 400, consentPhase: "ACCEPT_ALL" }),
        ],
      }),
    );
    expect(long.find((f) => f.ruleId === "PDM-R021")?.severity).toBe("INFO");
  });

  it("an Info finding does not add a second row beside a High one", () => {
    // One cookie, two true statements about it. The agency sees the one that
    // needs action, not both.
    const findings = evaluateRules(
      context({ cookies: [cookie({ name: "_long", durationDays: 400 })] }),
    );
    const forCookie = findings.filter((f) => f.subject === "_long");
    expect(forCookie).toHaveLength(1);
    expect(forCookie[0]?.ruleId).toBe("PDM-X01");
  });

  it("R022 fires for an HTTP page and for mixed content", () => {
    const httpPage = evaluateRules(
      context({ scan: scanFacts({ url: "http://example.test/" }) }),
    );
    expect(idsOf(httpPage)).toContain("PDM-R022");

    const mixed = evaluateRules(
      context({ requests: [request({ url: "http://insecure.example/tag.js" })] }),
    );
    expect(idsOf(mixed)).toContain("PDM-R022");
  });

  it("R023 needs three consecutive failures", () => {
    expect(
      idsOf(evaluateRules(context({ scan: scanFacts({ consecutiveFailures: 2 }) }))),
    ).not.toContain("PDM-R023");
    expect(
      idsOf(evaluateRules(context({ scan: scanFacts({ consecutiveFailures: 3 }) }))),
    ).toContain("PDM-R023");
  });

  it("R024 reports an incomplete scan, and dedupes on the SET of skipped phases", () => {
    const build = () =>
      evaluateRules(
        context({
          phases: [
            phase("NO_CONSENT", "EXECUTED"),
            phase("REJECT_ALL", "UNDETERMINED", {
              errorCode: "CONSENT_BUTTON_NOT_FOUND",
            }),
          ],
        }),
      ).find((f) => f.ruleId === "PDM-R024");

    expect(build()?.severity).toBe("INFO");
    // Same partial shape two nights running is ONE issue, not two.
    expect(build()?.fingerprint).toBe(build()?.fingerprint);
  });

  it("R025 fires only for a FAILED scan with an unreachable code", () => {
    const clientError = evaluateRules(
      context({ scan: scanFacts({ status: "FAILED", errorCode: "HTTP_CLIENT_ERROR" }) }),
    );
    // A 404 is not "unreachable" — the server answered.
    expect(idsOf(clientError)).not.toContain("PDM-R025");

    const dns = evaluateRules(
      context({ scan: scanFacts({ status: "FAILED", errorCode: "DNS_NXDOMAIN" }) }),
    );
    expect(idsOf(dns)).toContain("PDM-R025");
  });
});

describe("our own rules", () => {
  it("X01 reports a cookie set before consent", () => {
    const findings = evaluateRules(context({ cookies: [cookie()] }));
    expect(findings.find((f) => f.ruleId === "PDM-X01")?.severity).toBe("HIGH");
  });

  it("X02 reports storage written before consent, at Medium", () => {
    // localStorage is genuinely functional often enough that High would be
    // overstating what we can tell from a key name.
    const findings = evaluateRules(context({ storage: [storage()] }));
    expect(findings.find((f) => f.ruleId === "PDM-X02")?.severity).toBe("MEDIUM");
  });
});

describe("precedence", () => {
  it("collapses one behaviour into one finding", () => {
    const findings = evaluateRules(
      context({
        detections: [
          detection("vendor-meta", "REJECT_ALL"),
          detection("vendor-meta", "REJECT_ALL"),
        ],
      }),
    );
    const forMeta = findings.filter((f) => f.subject === "Meta Pixel");
    expect(forMeta).toHaveLength(1);
  });

  it("survives a rule that throws", () => {
    const broken: Rule = {
      id: "PDM-BROKEN",
      category: "SCAN_HEALTH",
      precedence: 1,
      evaluate() {
        throw new Error("boom");
      },
    };
    const findings = evaluateRules(context({ cookies: [cookie()] }), [
      broken,
      ...SCAN_RULES,
    ]);
    // The other rules still produced their findings.
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("every finding carries what the UI renders", () => {
  it("has a title, rationale and recommended action", () => {
    const findings = evaluateRules(
      context({
        detections: [detection("vendor-meta", "NO_CONSENT")],
        cookies: [cookie()],
        requests: [request()],
      }),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.title.length).toBeGreaterThan(5);
      expect(finding.rationale.length).toBeGreaterThan(10);
      // §4.11's "Recommended action" column — rule-authored, never AI (P1).
      expect(finding.recommendedAction.length).toBeGreaterThan(10);
      expect(finding.fingerprint).not.toContain("undefined");
    }
  });
});
