import { describe, expect, it } from "vitest";
import {
  measureDomGating,
  measureConsentButtonAsymmetry,
  type DomGatingFact,
  type ButtonGeometryFact,
} from "../instrumentation/dom-gating";
import { resolveDestinationCountry, COUNTRY_CODE_MAP } from "../net/geoip";

describe("DOM Gating & Asymmetric Geometry Instrumentation (PDM-R029 / PDM-R041)", () => {
  it("measureDomGating handles evaluation failure gracefully without throwing", async () => {
    const mockPage = {
      evaluate: async () => {
        throw new Error("Evaluation failed");
      },
    } as never;

    const result = await measureDomGating(mockPage);
    expect(result).toEqual({
      hasScrollLock: false,
      backdropCoveragePct: 0,
      hasCloseOrDismiss: true,
      isCookieWall: false,
    });
  });

  it("measureDomGating returns evaluated gating facts from page", async () => {
    const mockFact: DomGatingFact = {
      hasScrollLock: true,
      backdropCoveragePct: 95,
      hasCloseOrDismiss: false,
      isCookieWall: true,
    };

    const mockPage = {
      evaluate: async () => mockFact,
    } as never;

    const result = await measureDomGating(mockPage);
    expect(result.isCookieWall).toBe(true);
    expect(result.backdropCoveragePct).toBe(95);
    expect(result.hasScrollLock).toBe(true);
  });

  it("measureConsentButtonAsymmetry handles evaluation failure gracefully", async () => {
    const mockPage = {
      evaluate: async () => {
        throw new Error("Evaluation failed");
      },
    } as never;

    const result = await measureConsentButtonAsymmetry(mockPage);
    expect(result).toBeNull();
  });

  it("measureConsentButtonAsymmetry returns computed geometry ratio", async () => {
    const mockGeom: ButtonGeometryFact = {
      acceptArea: 12000,
      rejectArea: 3000,
      areaRatio: 4.0,
      isAsymmetric: true,
    };

    const mockPage = {
      evaluate: async () => mockGeom,
    } as never;

    const result = await measureConsentButtonAsymmetry(mockPage);
    expect(result).not.toBeNull();
    expect(result?.isAsymmetric).toBe(true);
    expect(result?.areaRatio).toBe(4.0);
  });
});

describe("GeoIP Destination Country Resolver (PDM-R040)", () => {
  it("resolves US IP addresses to US country code", async () => {
    const country = await resolveDestinationCountry("142.250.190.46"); // Google US
    expect(country).toBe("US");
  });

  it("resolves domain TLDs according to country code mapping", async () => {
    expect(await resolveDestinationCountry("analytics.company.de")).toBe("DE");
    expect(await resolveDestinationCountry("metrics.tracker.co.uk")).toBe("GB");
    expect(await resolveDestinationCountry("beacon.data.fr")).toBe("FR");
    expect(await resolveDestinationCountry("cdn.service.ie")).toBe("IE");
  });

  it("supports custom mock resolver for testing", async () => {
    const custom = await resolveDestinationCountry("custom.endpoint.internal", {
      resolver: async (ipOrHost) => (ipOrHost.includes("internal") ? "CH" : "US"),
    });
    expect(custom).toBe("CH");
  });
});
