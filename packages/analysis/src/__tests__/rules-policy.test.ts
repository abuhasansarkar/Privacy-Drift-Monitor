import { describe, expect, it } from "vitest";
import { evaluateRules, SCAN_RULES, type RuleContext } from "../rules";
import type { Detection, VendorPattern } from "../classify";
import type { ConsentPhase, PhaseResult } from "@pdm/scanner/types";

const gaVendor: VendorPattern = {
  id: "vendor-ga",
  slug: "ga",
  name: "Google Analytics 4",
  category: "ANALYTICS",
  riskLevel: "HIGH",
  domainPatterns: ["google-analytics.com"],
  scriptPatterns: [],
  cookiePatterns: [],
  storagePatterns: [],
  requestPathPatterns: [],
  baseConfidence: 0.9,
  isEssentialCandidate: false,
};

const metaVendor: VendorPattern = {
  id: "vendor-meta",
  slug: "meta",
  name: "Meta Pixel",
  category: "MARKETING",
  riskLevel: "HIGH",
  domainPatterns: ["facebook.net", "facebook.com"],
  scriptPatterns: [],
  cookiePatterns: [],
  storagePatterns: [],
  requestPathPatterns: [],
  baseConfidence: 0.95,
  isEssentialCandidate: false,
};

function detection(vendorId: string, phase: ConsentPhase = "NO_CONSENT"): Detection {
  return {
    vendorId,
    unknownDomain: null,
    consentPhase: phase,
    firstSeenAtMs: 100,
    requestCount: 2,
    matchedVia: "domain",
    confidence: 0.9,
    corroborated: true,
    evidenceSummary: {
      hosts: ["connect.facebook.net"],
      cookies: ["_fbp"],
      storageKeys: [],
      signals: ["domain"],
    },
  };
}

function context(overrides: Partial<RuleContext> = {}): RuleContext {
  const vendors = [gaVendor, metaVendor];
  const phases: PhaseResult[] = [
    {
      phase: "NO_CONSENT",
      status: "EXECUTED",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 1000,
      actionMethod: null,
      actionConfidence: null,
      selectorUsed: null,
      elementText: null,
      bannerDismissed: false,
      inIframe: false,
      errorCode: null,
      errorMessage: null,
      requests: [],
      cookies: [],
      storage: [],
      consoleLogs: [],
      screenshots: [],
    },
  ];

  return {
    phases,
    detections: [],
    vendorsById: new Map(vendors.map((v) => [v.id, v])),
    requests: [],
    cookies: [],
    storage: [],
    ...overrides,
  };
}

describe("Policy-to-Code Rules (Module 23 / Phase 14)", () => {
  describe("PDM-R034: Undisclosed Vendor (Ghost Tracker)", () => {
    it("emits nothing when no policy is present", () => {
      const ctx = context({
        detections: [detection("vendor-meta")],
        policy: undefined,
      });
      const findings = evaluateRules(ctx, SCAN_RULES);
      expect(findings.some((f) => f.ruleId === "PDM-R034")).toBe(false);
    });

    it("emits nothing when all detected vendors are declared in the policy", () => {
      const ctx = context({
        detections: [detection("vendor-meta")],
        policy: {
          policyUrl: "https://example.com/privacy",
          effectiveDate: new Date(),
          declaredVendors: ["meta", "Google Analytics 4"],
          undisclosedVendors: [], // Meta was disclosed
        },
      });
      const findings = evaluateRules(ctx, SCAN_RULES);
      expect(findings.some((f) => f.ruleId === "PDM-R034")).toBe(false);
    });

    it("triggers High finding and links request evidence when Meta Pixel is firing but undisclosed", () => {
      const ctx = context({
        detections: [detection("vendor-meta")],
        policy: {
          policyUrl: "https://example.com/privacy",
          effectiveDate: new Date(),
          declaredVendors: ["Google Analytics 4"],
          undisclosedVendors: ["meta"], // Meta was omitted!
        },
      });
      const findings = evaluateRules(ctx, SCAN_RULES);
      const ghostTracker = findings.find((f) => f.ruleId === "PDM-R034");

      expect(ghostTracker).toBeDefined();
      expect(ghostTracker?.severity).toBe("HIGH");
      expect(ghostTracker?.subject).toContain("Meta Pixel");
      expect(ghostTracker?.title).toContain("Meta Pixel was detected but is not named");
      expect(ghostTracker?.evidenceRefs.requestUrls).toContain("connect.facebook.net");
      expect(ghostTracker?.evidenceRefs.cookieNames).toContain("_fbp");
    });
  });

  describe("PDM-R049: Stale Policy Date (> 365 Days)", () => {
    it("emits nothing when no policy date is present", () => {
      const ctx = context({
        policy: {
          policyUrl: "https://example.com/privacy",
          effectiveDate: null,
          declaredVendors: [],
          undisclosedVendors: [],
        },
      });
      const findings = evaluateRules(ctx, SCAN_RULES);
      expect(findings.some((f) => f.ruleId === "PDM-R049")).toBe(false);
    });

    it("emits nothing when policy is updated recently (e.g. 45 days ago)", () => {
      const freshDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      const ctx = context({
        policy: {
          policyUrl: "https://example.com/privacy",
          effectiveDate: freshDate,
          declaredVendors: [],
          undisclosedVendors: [],
        },
      });
      const findings = evaluateRules(ctx, SCAN_RULES);
      expect(findings.some((f) => f.ruleId === "PDM-R049")).toBe(false);
    });

    it("triggers Info finding when policy date is older than 365 days", () => {
      const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      const ctx = context({
        policy: {
          policyUrl: "https://example.com/privacy",
          effectiveDate: staleDate,
          declaredVendors: [],
          undisclosedVendors: [],
        },
      });
      const findings = evaluateRules(ctx, SCAN_RULES);
      const staleFinding = findings.find((f) => f.ruleId === "PDM-R049");

      expect(staleFinding).toBeDefined();
      expect(staleFinding?.severity).toBe("INFO");
      expect(staleFinding?.title).toContain("states an effective date 400 days ago");
    });
  });
});
