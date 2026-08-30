import { describe, expect, it } from "vitest";
import { classify, type VendorPattern } from "../classify";
import type {
  ConsentPhase,
  RecordedCookie,
  RecordedRequest,
  RecordedStorageEntry,
} from "@pdm/scanner/types";

/**
 * CLASSIFICATION — §4.8.
 *
 * The assertions that matter are the ones that stop a FALSE POSITIVE. One
 * wrong "tracker detected before consent" destroys the trust this product is
 * sold on (§12.7), so the boundaries below are the point of the file:
 *   - a lookalike domain must not match
 *   - a first-party request is never a tracker detection
 *   - one signal is never corroborated, and only corroboration may reach Critical
 */

const ga: VendorPattern = {
  id: "vendor-ga",
  slug: "google-analytics-4",
  name: "Google Analytics 4",
  category: "ANALYTICS",
  riskLevel: "HIGH",
  domainPatterns: ["google-analytics.com"],
  scriptPatterns: ["gtag/js"],
  cookiePatterns: ["_ga", "_ga_*"],
  storagePatterns: [],
  requestPathPatterns: [],
  baseConfidence: 0.9,
  isEssentialCandidate: false,
};

const cookiebot: VendorPattern = {
  ...ga,
  id: "vendor-cookiebot",
  slug: "cookiebot",
  name: "Cookiebot",
  category: "CONSENT",
  domainPatterns: ["consent.cookiebot.com"],
  scriptPatterns: [],
  cookiePatterns: ["CookieConsent"],
  baseConfidence: 0.95,
  isEssentialCandidate: true,
};

function request(
  overrides: Partial<RecordedRequest> & { host: string },
): RecordedRequest {
  return {
    pageUrl: "https://acme.test/",
    consentPhase: "NO_CONSENT",
    url: `https://${overrides.host}/x.js`,
    method: "GET",
    resourceType: "script",
    registrableDomain: overrides.host,
    isThirdParty: true,
    status: 200,
    failureText: null,
    initiatorType: "script",
    initiatorUrl: null,
    timestampMs: 500,
    transferSize: null,
    redirectChain: [],
    setCookieCount: 0,
    ...overrides,
  };
}

function cookie(name: string, phase: ConsentPhase = "NO_CONSENT"): RecordedCookie {
  return {
    consentPhase: phase,
    snapshotPoint: "after_settle",
    name,
    domain: "acme.test",
    path: "/",
    isSession: false,
    durationDays: 730,
    secure: true,
    httpOnly: false,
    sameSite: "Lax",
    isThirdParty: false,
    valueHash: "h:x",
    valueLength: 10,
    valueRaw: null,
  };
}

function storage(key: string): RecordedStorageEntry {
  return {
    consentPhase: "NO_CONSENT",
    storageType: "local",
    key,
    valueLength: 10,
    valueHash: "h:y",
    origin: "https://acme.test",
  };
}

const empty = { requests: [], cookies: [], storage: [] };

describe("classify — identification", () => {
  it("matches a vendor by request domain", () => {
    const [detection] = classify({
      ...empty,
      vendors: [ga],
      requests: [request({ host: "www.google-analytics.com" })],
    });

    expect(detection?.vendorId).toBe("vendor-ga");
    expect(detection?.requestCount).toBe(1);
    expect(detection?.firstSeenAtMs).toBe(500);
  });

  it("matches a subdomain of a literal pattern without a second wildcard entry", () => {
    const [detection] = classify({
      ...empty,
      vendors: [ga],
      requests: [request({ host: "region1.google-analytics.com" })],
    });
    expect(detection?.vendorId).toBe("vendor-ga");
  });

  it("does NOT match a lookalike domain", () => {
    // The classic suffix-matching bug: `endsWith("google-analytics.com")` calls
    // this a match, and the product then reports a tracker that is not there.
    const detections = classify({
      ...empty,
      vendors: [ga],
      requests: [request({ host: "google-analytics.com.evil.test" })],
    });

    expect(detections.every((d) => d.vendorId !== "vendor-ga")).toBe(true);
  });

  it("never classifies a first-party request as a tracker", () => {
    const detections = classify({
      ...empty,
      vendors: [ga],
      requests: [
        request({ host: "www.google-analytics.com", isThirdParty: false }),
      ],
    });
    expect(detections).toHaveLength(0);
  });
});

describe("classify — corroboration", () => {
  it("is NOT corroborated on a single signal", () => {
    const [detection] = classify({
      ...empty,
      vendors: [ga],
      requests: [request({ host: "www.google-analytics.com" })],
    });

    expect(detection?.corroborated).toBe(false);
    expect(detection?.confidence).toBe(0.9);
  });

  it("IS corroborated when a request and a cookie agree", () => {
    const [detection] = classify({
      vendors: [ga],
      requests: [request({ host: "www.google-analytics.com" })],
      cookies: [cookie("_ga")],
      storage: [],
    });

    // The gate for Critical (§4.8): two INDEPENDENT signal types.
    expect(detection?.corroborated).toBe(true);
    expect(detection?.matchedVia).toContain("domain");
    expect(detection?.matchedVia).toContain("cookie");
    expect(detection?.confidence).toBeGreaterThan(0.9);
  });

  it("is not corroborated by repetition of one signal", () => {
    const [detection] = classify({
      ...empty,
      vendors: [ga],
      requests: Array.from({ length: 50 }, () =>
        request({ host: "www.google-analytics.com" }),
      ),
    });

    // Volume is not evidence of identity. Fifty hits from one domain is still
    // one signal type.
    expect(detection?.requestCount).toBe(50);
    expect(detection?.corroborated).toBe(false);
    expect(detection?.confidence).toBe(0.9);
  });

  it("matches a wildcard cookie pattern", () => {
    const [detection] = classify({
      vendors: [ga],
      requests: [],
      cookies: [cookie("_ga_ABC123")],
      storage: [],
    });
    expect(detection?.vendorId).toBe("vendor-ga");
    expect(detection?.evidenceSummary.cookies).toContain("_ga_ABC123");
  });

  it("counts storage as its own signal type", () => {
    const withStorage: VendorPattern = { ...ga, storagePatterns: ["_ga_state"] };
    const [detection] = classify({
      vendors: [withStorage],
      requests: [request({ host: "www.google-analytics.com" })],
      cookies: [],
      storage: [storage("_ga_state")],
    });
    expect(detection?.corroborated).toBe(true);
  });
});

describe("classify — phases and unknowns", () => {
  it("keeps the same vendor in two phases as two detections", () => {
    const detections = classify({
      ...empty,
      vendors: [ga],
      requests: [
        request({ host: "www.google-analytics.com", consentPhase: "NO_CONSENT" }),
        request({ host: "www.google-analytics.com", consentPhase: "ACCEPT_ALL" }),
      ],
    });

    // Before consent and after Accept All are different findings — collapsing
    // them would erase the distinction the product exists to draw.
    expect(detections).toHaveLength(2);
    expect(detections.map((d) => d.consentPhase).sort()).toEqual([
      "ACCEPT_ALL",
      "NO_CONSENT",
    ]);
  });

  it("records an unknown third party rather than dropping it", () => {
    const [detection] = classify({
      ...empty,
      vendors: [ga],
      requests: [request({ host: "cdn.unknown-vendor.test" })],
    });

    expect(detection?.vendorId).toBeNull();
    expect(detection?.unknownDomain).toBe("cdn.unknown-vendor.test");
    // It knows a third party was contacted and nothing more, so it can never
    // support a Critical finding.
    expect(detection?.corroborated).toBe(false);
    expect(detection?.confidence).toBeLessThan(0.5);
  });

  it("groups repeated unknown hosts by registrable domain", () => {
    const detections = classify({
      ...empty,
      vendors: [],
      requests: [
        request({ host: "a.unknown.test", registrableDomain: "unknown.test" }),
        request({ host: "b.unknown.test", registrableDomain: "unknown.test" }),
      ],
    });

    expect(detections).toHaveLength(1);
    expect(detections[0]?.requestCount).toBe(2);
    expect(detections[0]?.evidenceSummary.hosts).toHaveLength(2);
  });

  it("flags an essential-candidate vendor without downgrading the detection", () => {
    const [detection] = classify({
      ...empty,
      vendors: [cookiebot],
      requests: [request({ host: "consent.cookiebot.com" })],
    });

    // The classifier reports WHAT it is. Whether a CMP loading pre-consent is
    // acceptable is the rule engine's judgement, not this module's (P6).
    expect(detection?.vendorId).toBe("vendor-cookiebot");
    expect(detection?.consentPhase).toBe("NO_CONSENT");
  });
});
