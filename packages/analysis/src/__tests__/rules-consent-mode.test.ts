import { describe, expect, it } from "vitest";
import type { PhaseResult } from "@pdm/scanner/types";
import { evaluateRules, SCAN_RULES } from "../rules";
import { R051, R052 } from "../rules/consent-mode";
import type { RuleContext } from "../rules/types";

function mockPhase(
  name: "NO_CONSENT" | "REJECT_ALL" | "ACCEPT_ALL",
  status: "EXECUTED" | "UNDETERMINED" | "FAILED" = "EXECUTED",
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
  };
}

function mockContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    phases: [mockPhase("NO_CONSENT"), mockPhase("REJECT_ALL")],
    detections: [],
    vendorsById: new Map(),
    requests: [],
    cookies: [],
    storage: [],
    ...overrides,
  };
}

describe("Google Consent Mode v2 Rules (PDM-R051 & PDM-R052)", () => {
  describe("PDM-R051 — GCM default granted before consent", () => {
    it("emits nothing when consent mode is not detected", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: false,
          preConsentAdStorage: null,
          preConsentAnalytics: null,
          postRejectAdStorage: null,
          postRejectAnalytics: null,
          postRejectUserData: null,
          postRejectPersonalize: null,
          issuesDetected: [],
        },
      });

      const findings = R051.evaluate(ctx);
      expect(findings).toEqual([]);
    });

    it("emits a Critical finding when ad_storage defaults to granted before consent", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: true,
          preConsentAdStorage: "granted",
          preConsentAnalytics: "denied",
          postRejectAdStorage: null,
          postRejectAnalytics: null,
          postRejectUserData: null,
          postRejectPersonalize: null,
          issuesDetected: ["PDM-R051"],
        },
      });

      const findings = R051.evaluate(ctx);
      expect(findings).toHaveLength(1);
      const finding = findings[0]!;
      expect(finding.ruleId).toBe("PDM-R051");
      expect(finding.severity).toBe("CRITICAL");
      expect(finding.category).toBe("TAG_MANAGER");
      expect(finding.consentPhase).toBe("NO_CONSENT");
      expect(finding.title).toContain("Google Consent Mode");
      expect(finding.recommendedAction).toContain("ad_storage and analytics_storage to 'denied'");
    });

    it("emits nothing when both default parameters are denied", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: true,
          preConsentAdStorage: "denied",
          preConsentAnalytics: "denied",
          postRejectAdStorage: "denied",
          postRejectAnalytics: "denied",
          postRejectUserData: "denied",
          postRejectPersonalize: "denied",
          issuesDetected: [],
        },
      });

      const findings = R051.evaluate(ctx);
      expect(findings).toEqual([]);
    });
  });

  describe("PDM-R052 — GCM reject ignored or incomplete", () => {
    it("emits a High finding when Reject All update is missing", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: true,
          preConsentAdStorage: "denied",
          preConsentAnalytics: "denied",
          postRejectAdStorage: null,
          postRejectAnalytics: null,
          postRejectUserData: null,
          postRejectPersonalize: null,
          issuesDetected: ["PDM-R052"],
        },
      });

      const findings = R052.evaluate(ctx);
      expect(findings).toHaveLength(1);
      const finding = findings[0]!;
      expect(finding.ruleId).toBe("PDM-R052");
      expect(finding.severity).toBe("HIGH");
      expect(finding.category).toBe("CONSENT_FAILURE");
      expect(finding.consentPhase).toBe("REJECT_ALL");
    });

    it("emits a High finding when Reject All update leaves ad_user_data granted", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: true,
          preConsentAdStorage: "denied",
          preConsentAnalytics: "denied",
          postRejectAdStorage: "denied",
          postRejectAnalytics: "denied",
          postRejectUserData: "granted",
          postRejectPersonalize: "denied",
          issuesDetected: ["PDM-R052"],
        },
      });

      const findings = R052.evaluate(ctx);
      expect(findings).toHaveLength(1);
      const finding = findings[0]!;
      expect(finding.ruleId).toBe("PDM-R052");
      expect(finding.severity).toBe("HIGH");
    });

    it("emits nothing when Reject All updates all 4 parameters to denied", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: true,
          preConsentAdStorage: "denied",
          preConsentAnalytics: "denied",
          postRejectAdStorage: "denied",
          postRejectAnalytics: "denied",
          postRejectUserData: "denied",
          postRejectPersonalize: "denied",
          issuesDetected: [],
        },
      });

      const findings = R052.evaluate(ctx);
      expect(findings).toEqual([]);
    });

    it("evaluates cleanly within SCAN_RULES pipeline", () => {
      const ctx = mockContext({
        consentMode: {
          isConsentModeDetected: true,
          preConsentAdStorage: "granted",
          preConsentAnalytics: "denied",
          postRejectAdStorage: null,
          postRejectAnalytics: null,
          postRejectUserData: null,
          postRejectPersonalize: null,
          issuesDetected: ["PDM-R051", "PDM-R052"],
        },
      });

      const findings = evaluateRules(ctx, SCAN_RULES);
      const ruleIds = findings.map((f) => f.ruleId);
      expect(ruleIds).toContain("PDM-R051");
      expect(ruleIds).toContain("PDM-R052");
    });
  });
});
