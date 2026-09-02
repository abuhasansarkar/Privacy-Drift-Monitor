import { describe, expect, it } from "vitest";
import type {
  ConsentPhase,
  PhaseResult,
  PhaseStatus,
} from "@pdm/scanner/types";
import type { Detection, VendorPattern } from "../classify";
import { R031, R032, R033 } from "../rules/us-compliance";
import type { RuleContext } from "../rules/types";

const metaPixel: VendorPattern = {
  id: "vendor-meta",
  slug: "meta-pixel",
  name: "Meta Pixel",
  category: "MARKETING",
  riskLevel: "CRITICAL",
  domainPatterns: ["connect.facebook.net"],
  scriptPatterns: ["fbevents.js"],
  cookiePatterns: ["_fbp"],
  storagePatterns: [],
  requestPathPatterns: ["/tr/"],
  baseConfidence: 0.95,
  isEssentialCandidate: false,
};

const criteo: VendorPattern = {
  id: "vendor-criteo",
  slug: "criteo",
  name: "Criteo",
  category: "ADVERTISING",
  riskLevel: "CRITICAL",
  domainPatterns: ["criteo.net"],
  scriptPatterns: ["ld.js"],
  cookiePatterns: ["cto_bundle"],
  storagePatterns: [],
  requestPathPatterns: [],
  baseConfidence: 0.9,
  isEssentialCandidate: false,
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
    unknownDomain: vendorId ? null : "weird-adtech.example",
    consentPhase,
    firstSeenAtMs: 300,
    requestCount: 2,
    matchedVia: "script",
    confidence: 0.95,
    corroborated: true,
    evidenceSummary: {
      signals: ["script", "domain"],
      hosts: ["connect.facebook.net"],
      cookies: ["_fbp"],
      storageKeys: [],
    },
    ...overrides,
  };
}

function context(
  phases: PhaseResult[],
  detections: Detection[],
  vendors: VendorPattern[] = [metaPixel, criteo],
): RuleContext {
  return {
    phases,
    detections,
    vendorsById: new Map(vendors.map((v) => [v.id, v])),
    requests: [],
    cookies: [],
    storage: [],
    scan: {
      status: "COMPLETED",
      errorCode: null,
      url: "https://shop.example.com",
      consecutiveFailures: 0,
      cmpId: null,
      cmpName: null,
    },
  };
}

describe("US Compliance & Global Privacy Control (GPC) Rules", () => {
  describe("PDM-R031 — Global Privacy Control Signal Ignored", () => {
    it("fires CRITICAL when marketing tracker fires despite Sec-GPC: 1 header", () => {
      const ctx = context(
        [phase("GLOBAL_PRIVACY_CONTROL", "EXECUTED")],
        [detection("vendor-meta", "GLOBAL_PRIVACY_CONTROL", { corroborated: true })],
      );

      const findings = R031.evaluate(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("PDM-R031");
      expect(findings[0]?.severity).toBe("CRITICAL");
      expect(findings[0]?.category).toBe("US_CCPA");
      expect(findings[0]?.subject).toBe("Meta Pixel");
      expect(findings[0]?.consentPhase).toBe("GLOBAL_PRIVACY_CONTROL");
      expect(findings[0]?.evidenceRefs.requestUrls).toContain("connect.facebook.net");
    });

    it("does not fire when GPC phase was UNDETERMINED or SKIPPED", () => {
      const ctx = context(
        [phase("GLOBAL_PRIVACY_CONTROL", "UNDETERMINED")],
        [detection("vendor-meta", "GLOBAL_PRIVACY_CONTROL")],
      );

      expect(R031.evaluate(ctx)).toHaveLength(0);
    });
  });

  describe("PDM-R032 — Missing CCPA Do Not Sell/Share Link", () => {
    it("fires HIGH when site runs marketing pixels pre-consent without CMP or CCPA link", () => {
      const ctx = context(
        [phase("GLOBAL_PRIVACY_CONTROL", "EXECUTED"), phase("NO_CONSENT", "EXECUTED")],
        [detection("vendor-meta", "NO_CONSENT")],
      );

      const findings = R032.evaluate(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("PDM-R032");
      expect(findings[0]?.severity).toBe("HIGH");
      expect(findings[0]?.category).toBe("US_CCPA");
    });
  });

  describe("PDM-R033 — Broken CCPA Opt-Out Preference Center", () => {
    it("fires CRITICAL when ad network tags continue transmitting after CCPA opt-out", () => {
      const ctx = context(
        [phase("GLOBAL_PRIVACY_CONTROL", "EXECUTED")],
        [detection("vendor-criteo", "GLOBAL_PRIVACY_CONTROL")],
      );

      const findings = R033.evaluate(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("PDM-R033");
      expect(findings[0]?.severity).toBe("CRITICAL");
      expect(findings[0]?.subject).toBe("Criteo");
    });
  });
});
