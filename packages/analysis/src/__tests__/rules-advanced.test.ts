import { describe, expect, it } from "vitest";
import { R029, R040, R041, R043, R045 } from "../rules/advanced";
import type { RuleContext } from "../rules/types";
import type { RecordedRequest } from "@pdm/scanner/types";

function createMockContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    phases: [],
    detections: [],
    vendorsById: new Map(),
    requests: [],
    cookies: [],
    storage: [],
    ...overrides,
  };
}

describe("PDM-R029 — Cookie Wall / Forcible Gating", () => {
  it("emits nothing if domGating is undefined or isCookieWall is false", () => {
    const ctx1 = createMockContext();
    expect(R029.evaluate(ctx1)).toEqual([]);

    const ctx2 = createMockContext({
      domGating: {
        hasScrollLock: false,
        backdropCoveragePct: 20,
        hasCloseOrDismiss: true,
        isCookieWall: false,
      },
    });
    expect(R029.evaluate(ctx2)).toEqual([]);
  });

  it("emits HIGH finding when cookie wall gating is detected", () => {
    const ctx = createMockContext({
      domGating: {
        hasScrollLock: true,
        backdropCoveragePct: 95,
        hasCloseOrDismiss: false,
        isCookieWall: true,
      },
    });

    const findings = R029.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("PDM-R029");
    expect(findings[0].severity).toBe("HIGH");
    expect(findings[0].category).toBe("CONSENT_FAILURE");
    expect(findings[0].title).toContain("Cookie wall detected");
  });
});

describe("PDM-R040 — Cross-Border Data Transfer", () => {
  it("emits nothing if no third-party requests have non-EEA destination", () => {
    const requests: RecordedRequest[] = [
      {
        pageUrl: "https://example.com",
        consentPhase: "NO_CONSENT",
        url: "https://example.com/api",
        method: "GET",
        resourceType: "fetch",
        host: "example.com",
        registrableDomain: "example.com",
        isThirdParty: false,
        status: 200,
        failureText: null,
        initiatorType: "fetch",
        initiatorUrl: null,
        timestampMs: 100,
        transferSize: 500,
        redirectChain: [],
        setCookieCount: 0,
        destinationCountry: "DE",
      },
      {
        pageUrl: "https://example.com",
        consentPhase: "NO_CONSENT",
        url: "https://tracker.ie/ping",
        method: "GET",
        resourceType: "image",
        host: "tracker.ie",
        registrableDomain: "tracker.ie",
        isThirdParty: true,
        status: 200,
        failureText: null,
        initiatorType: "image",
        initiatorUrl: null,
        timestampMs: 150,
        transferSize: 100,
        redirectChain: [],
        setCookieCount: 0,
        destinationCountry: "IE",
      },
    ];

    const ctx = createMockContext({ requests });
    expect(R040.evaluate(ctx)).toEqual([]);
  });

  it("emits MEDIUM finding when third-party request exfiltrates data to US destination before consent", () => {
    const requests: RecordedRequest[] = [
      {
        pageUrl: "https://example.com",
        consentPhase: "NO_CONSENT",
        url: "https://analytics.us-cloud.com/collect",
        method: "POST",
        resourceType: "fetch",
        host: "analytics.us-cloud.com",
        registrableDomain: "us-cloud.com",
        isThirdParty: true,
        status: 200,
        failureText: null,
        initiatorType: "fetch",
        initiatorUrl: null,
        timestampMs: 200,
        transferSize: 800,
        redirectChain: [],
        setCookieCount: 0,
        destinationCountry: "US",
      },
    ];

    const ctx = createMockContext({ requests });
    const findings = R040.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("PDM-R040");
    expect(findings[0].severity).toBe("MEDIUM");
    expect(findings[0].category).toBe("TRANSPORT_SECURITY");
    expect(findings[0].title).toContain("US");
  });
});

describe("PDM-R041 — Asymmetric Consent Button Sizing", () => {
  it("emits nothing if buttonGeometry is balanced (isAsymmetric false)", () => {
    const ctx = createMockContext({
      buttonGeometry: {
        acceptArea: 5000,
        rejectArea: 4800,
        areaRatio: 1.04,
        isAsymmetric: false,
      },
    });
    expect(R041.evaluate(ctx)).toEqual([]);
  });

  it("emits MEDIUM finding when Accept button is more than 2x larger than Reject", () => {
    const ctx = createMockContext({
      buttonGeometry: {
        acceptArea: 10000,
        rejectArea: 2500,
        areaRatio: 4.0,
        isAsymmetric: true,
      },
    });

    const findings = R041.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("PDM-R041");
    expect(findings[0].severity).toBe("MEDIUM");
    expect(findings[0].category).toBe("CONSENT_MISSING");
    expect(findings[0].title).toContain("4x larger");
  });
});

describe("PDM-R043 — Form Submission Tracker Burst", () => {
  it("emits nothing if no burst requests detected", () => {
    const ctx = createMockContext({
      formSubmission: {
        formFound: true,
        formSubmitted: true,
        burstRequestsDetected: 0,
        burstTrackerDomains: [],
      },
    });
    expect(R043.evaluate(ctx)).toEqual([]);
  });

  it("emits HIGH finding when form submission triggers unconsented conversion beacons", () => {
    const ctx = createMockContext({
      formSubmission: {
        formFound: true,
        formSubmitted: true,
        burstRequestsDetected: 3,
        burstTrackerDomains: ["facebook.com", "google-analytics.com"],
      },
    });

    const findings = R043.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("PDM-R043");
    expect(findings[0].severity).toBe("HIGH");
    expect(findings[0].category).toBe("INTERACTION");
    expect(findings[0].title).toContain("Unconsented tracker burst");
  });
});

describe("PDM-R045 — Browser Fingerprinting Detection", () => {
  it("emits nothing if hasFingerprinting is false", () => {
    const ctx = createMockContext({
      fingerprint: {
        hasFingerprinting: false,
        canvasAttempts: 0,
        audioAttempts: 0,
        webglAttempts: 0,
        stackSnippets: [],
      },
    });
    expect(R045.evaluate(ctx)).toEqual([]);
  });

  it("emits CRITICAL finding when canvas and audio fingerprinting APIs are called", () => {
    const ctx = createMockContext({
      fingerprint: {
        hasFingerprinting: true,
        canvasAttempts: 2,
        audioAttempts: 1,
        webglAttempts: 0,
        stackSnippets: ["at tracker.js:14:2", "at audio-probe.js:8:5"],
      },
    });

    const findings = R045.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("PDM-R045");
    expect(findings[0].severity).toBe("CRITICAL");
    expect(findings[0].category).toBe("FINGERPRINT");
    expect(findings[0].title).toContain("Browser fingerprinting");
  });
});
