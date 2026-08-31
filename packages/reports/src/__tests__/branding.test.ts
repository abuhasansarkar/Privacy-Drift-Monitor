import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import {
  checkBrandColor,
  contrastRatio,
  readableTextOn,
  BASE_DISCLAIMER,
  PLATFORM_BRAND_NAME,
} from "@pdm/shared/branding";
import {
  fromBrandingSnapshot,
  invalidateBranding,
  resetBrandingCache,
  resolveBranding,
  toBrandingSnapshot,
} from "../branding";
import { renderReportHtml } from "../render";
import { DEFAULT_REPORT_OPTIONS, type ReportDocument } from "../types";

/**
 * THE CROSS-TENANT LEAKAGE ACCEPTANCE CRITERION — §12.3:
 *
 *   "Two agencies' reports rendered concurrently do not cross-contaminate
 *    branding (asserted)."
 *
 * ⚠️ ASSERTED, NOT REASONED ABOUT. This file runs against real Postgres and
 * renders both documents in the same process at the same time, which is the
 * only arrangement that can catch a module-level brand or a mis-keyed cache.
 */

let agencyA: Awaited<ReturnType<typeof makeAgency>>;
let agencyB: Awaited<ReturnType<typeof makeAgency>>;

beforeAll(async () => {
  await resetDatabase();
  agencyA = await makeAgency({ name: "Northlight Digital" });
  agencyB = await makeAgency({ name: "Harbourside Studio" });

  await repositoriesFor(agencyA.id).branding.upsert({
    companyName: "Northlight Digital",
    logoLightUrl: null,
    logoDarkUrl: null,
    primaryColor: "#1D4ED8",
    accentColor: "#0EA5E9",
    contactEmail: "hello@northlight.test",
    contactPhone: null,
    reportFooterText: "Northlight Digital Ltd · Bristol",
    customDisclaimer: "Questions about this report? Reply to this email.",
    portalWelcomeText: null,
  });

  await repositoriesFor(agencyB.id).branding.upsert({
    companyName: "Harbourside Studio",
    logoLightUrl: null,
    logoDarkUrl: null,
    primaryColor: "#7C3AED",
    accentColor: "#F97316",
    contactEmail: "studio@harbourside.test",
    contactPhone: null,
    reportFooterText: "Harbourside Studio · Cork",
    customDisclaimer: null,
    portalWelcomeText: null,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  resetBrandingCache();
});

const WHITE_LABEL = { whiteLabelEnabled: true };

function documentFor(
  branding: Awaited<ReturnType<typeof resolveBranding>>,
  name: string,
): ReportDocument {
  return {
    meta: {
      reportId: `report-${branding.agencyId}`,
      type: "PRIVACY_DRIFT",
      name,
      generatedAt: new Date("2026-03-31T09:00:00Z"),
      periodStart: new Date("2026-03-01T00:00:00Z"),
      periodEnd: new Date("2026-03-31T00:00:00Z"),
      timeZone: "Europe/London",
      agencyName: branding.companyName,
      clientName: "Acme Dental",
      websiteLabel: "acme.test",
    },
    options: DEFAULT_REPORT_OPTIONS,
    branding,
    payload: {
      type: "PRIVACY_DRIFT",
      events: [],
      bySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 0, INFO: 0 },
    },
  };
}

describe("resolveBranding", () => {
  it("reads each agency's own branding by explicit agencyId", async () => {
    const a = await resolveBranding(agencyA.id, WHITE_LABEL);
    const b = await resolveBranding(agencyB.id, WHITE_LABEL);

    expect(a.companyName).toBe("Northlight Digital");
    expect(a.primaryColor).toBe("#1D4ED8");
    expect(b.companyName).toBe("Harbourside Studio");
    expect(b.primaryColor).toBe("#7C3AED");
  });

  it("returns OUR brand when the plan does not include white-label", async () => {
    // §6.9: enforcement lives in the resolver, not in each template — so the
    // stored values are ignored rather than merely unused.
    const a = await resolveBranding(agencyA.id, { whiteLabelEnabled: false });
    expect(a.isWhiteLabelled).toBe(false);
    expect(a.primaryColor).toBe("#2563EB");
    expect(a.customDisclaimer).toBeNull();
    expect(a.reportFooterText).toBeNull();
  });

  /**
   * ⚠️ THE ASSERTION THAT WAS MISSING, AND THE BUG IT LET THROUGH.
   *
   * The test above checked the colour and the disclaimer but never the COMPANY
   * NAME — and the resolver fell back to `defaultBranding(agencyId, agencyName)`,
   * which carries the AGENCY's name. So a Starter-plan agency's client received
   * an email reading "Northlight Digital" while paying for nothing, and the
   * upgrade to Growth would have bought only colours.
   *
   * §6.9 says "our default brand regardless of stored values". The company name
   * is the most visible part of a brand, so it is the part the assertion has to
   * name explicitly.
   */
  it("uses OUR company name, not the agency's, when white-label is off", async () => {
    const a = await resolveBranding(agencyA.id, { whiteLabelEnabled: false });
    expect(a.companyName).toBe(PLATFORM_BRAND_NAME);
    expect(a.companyName).not.toBe("Northlight Digital");

    const b = await resolveBranding(agencyB.id, { whiteLabelEnabled: false });
    expect(b.companyName).toBe(PLATFORM_BRAND_NAME);
    // Two different agencies, both unentitled, both OURS — and identical, which
    // is what makes this safe to cache.
    expect(b.companyName).toBe(a.companyName);
  });

  it("keeps the agency's name when white-label IS entitled", async () => {
    // The feature still has to work; the fix must not have removed it.
    const a = await resolveBranding(agencyA.id, WHITE_LABEL);
    expect(a.companyName).toBe("Northlight Digital");
    expect(a.isWhiteLabelled).toBe(true);
  });

  it("resolves the entitlement itself when the caller does not pass one", async () => {
    /*
     * ⚠️ THE INTENDED CALL. §6.9 puts the entitlement in the resolver, and it
     * spent a while as a hardcoded `whiteLabelEnabled: true` at seven call
     * sites instead. With no subscription row — which is every agency until
     * billing lands — the answer is our brand.
     */
    const resolved = await resolveBranding(agencyA.id);
    expect(resolved.isWhiteLabelled).toBe(false);
    expect(resolved.companyName).toBe(PLATFORM_BRAND_NAME);
  });

  it("does not serve a white-labelled cache entry to an unentitled read", async () => {
    // Warm the cache with the entitled answer, then ask as an unentitled caller.
    await resolveBranding(agencyA.id, WHITE_LABEL);
    const unentitled = await resolveBranding(agencyA.id, { whiteLabelEnabled: false });
    expect(unentitled.companyName).toBe(PLATFORM_BRAND_NAME);
  });

  it("caches per agency and never serves one agency's entry to another", async () => {
    const first = await resolveBranding(agencyA.id, WHITE_LABEL);
    // Change the row underneath: a cache hit must still return the FIRST
    // agency's values, and the second agency must be unaffected either way.
    await repositoriesFor(agencyA.id).branding.upsert({
      companyName: "Renamed",
      logoLightUrl: null,
      logoDarkUrl: null,
      primaryColor: "#000000",
      accentColor: "#000000",
      contactEmail: null,
      contactPhone: null,
      reportFooterText: null,
      customDisclaimer: null,
      portalWelcomeText: null,
    });

    const cached = await resolveBranding(agencyA.id, WHITE_LABEL);
    expect(cached.companyName).toBe(first.companyName);

    const b = await resolveBranding(agencyB.id, WHITE_LABEL);
    expect(b.companyName).toBe("Harbourside Studio");

    invalidateBranding(agencyA.id);
    const fresh = await resolveBranding(agencyA.id, WHITE_LABEL);
    expect(fresh.companyName).toBe("Renamed");

    // Restore for the remaining tests.
    await repositoriesFor(agencyA.id).branding.upsert({
      companyName: "Northlight Digital",
      logoLightUrl: null,
      logoDarkUrl: null,
      primaryColor: "#1D4ED8",
      accentColor: "#0EA5E9",
      contactEmail: "hello@northlight.test",
      contactPhone: null,
      reportFooterText: "Northlight Digital Ltd · Bristol",
      customDisclaimer: "Questions about this report? Reply to this email.",
      portalWelcomeText: null,
    });
    invalidateBranding(agencyA.id);
  });

  it("hands out a copy, so a caller's mutation cannot poison the cache", async () => {
    const first = await resolveBranding(agencyA.id, WHITE_LABEL);
    first.companyName = "Mutated";
    const second = await resolveBranding(agencyA.id, WHITE_LABEL);
    expect(second.companyName).toBe("Northlight Digital");
  });

  it("refuses an empty agencyId rather than defaulting the brand", async () => {
    await expect(resolveBranding("", WHITE_LABEL)).rejects.toThrow(/agencyId/);
  });
});

describe("concurrent multi-tenant render", () => {
  it("does not cross-contaminate branding — §12.3 acceptance criterion", async () => {
    // Both resolved AND both rendered concurrently, in one process, repeatedly:
    // a module-level brand or a mis-keyed cache shows up as one document
    // carrying the other's colour.
    const rounds = 12;
    const results = await Promise.all(
      Array.from({ length: rounds }, async (_unused, index) => {
        const agency = index % 2 === 0 ? agencyA : agencyB;
        const branding = await resolveBranding(agency.id, WHITE_LABEL);
        const html = renderReportHtml(documentFor(branding, `Report ${index}`));
        return { agencyId: agency.id, html };
      }),
    );

    /*
     * ⚠️ Asserted on the BRAND-BEARING declarations, not on a bare colour
     * search. `#B91C1C` is also the CRITICAL severity token and appears in
     * every report regardless of brand — a naive `not.toContain(colour)` would
     * fail on correct output, and worse, would have to be relaxed into
     * something that no longer proves anything.
     */
    const brandRule = (colour: string) => `background: ${colour};`;
    const wordmarkRule = (colour: string) => `color: ${colour};`;

    for (const result of results) {
      if (result.agencyId === agencyA.id) {
        expect(result.html).toContain("Northlight Digital");
        expect(result.html).toContain(brandRule("#1D4ED8"));
        expect(result.html).toContain(wordmarkRule("#1D4ED8"));
        expect(result.html).not.toContain("Harbourside Studio");
        expect(result.html).not.toContain(brandRule("#7C3AED"));
        expect(result.html).not.toContain("harbourside.test");
      } else {
        expect(result.html).toContain("Harbourside Studio");
        expect(result.html).toContain(brandRule("#7C3AED"));
        expect(result.html).toContain(wordmarkRule("#7C3AED"));
        expect(result.html).not.toContain("Northlight Digital");
        expect(result.html).not.toContain(brandRule("#1D4ED8"));
        expect(result.html).not.toContain("northlight.test");
      }
    }
  });

  it("embeds the base disclaimer in every rendered report", async () => {
    for (const agency of [agencyA, agencyB]) {
      const branding = await resolveBranding(agency.id, WHITE_LABEL);
      const html = renderReportHtml(documentFor(branding, "Drift report"));
      // §6.8: the agency's text is APPENDED, never a replacement.
      expect(html).toContain("not legal advice");
      expect(html.indexOf(BASE_DISCLAIMER.slice(0, 40))).toBeGreaterThan(-1);
    }
  });

  it("never renders pass/fail or banned terminology", async () => {
    const branding = await resolveBranding(agencyA.id, WHITE_LABEL);
    const html = renderReportHtml(documentFor(branding, "Drift report")).toLowerCase();
    for (const term of ["violation", "non-compliant", "illegal", "you must", "gdpr breach"]) {
      expect(html).not.toContain(term);
    }
  });
});

describe("branding snapshot", () => {
  it("round-trips, so a re-download renders as it was sent", async () => {
    const branding = await resolveBranding(agencyA.id, WHITE_LABEL);
    const snapshot = toBrandingSnapshot(branding);
    expect(fromBrandingSnapshot(snapshot, branding)).toEqual(branding);
  });

  it("falls back rather than throwing on a snapshot from an older version", async () => {
    const branding = await resolveBranding(agencyA.id, WHITE_LABEL);
    expect(fromBrandingSnapshot(null, branding)).toEqual(branding);
    expect(fromBrandingSnapshot({ nonsense: true }, branding)).toEqual(branding);
  });
});

describe("contrast validation (§6.9, §11.6)", () => {
  it("accepts a brand colour that passes AA against both surfaces", () => {
    expect(checkBrandColor("#1D4ED8").valid).toBe(true);
    expect(checkBrandColor("#7C3AED").valid).toBe(true);
  });

  it("rejects a pale colour that would render an unreadable report", () => {
    const result = checkBrandColor("#FDE68A");
    expect(result.valid).toBe(false);
    expect(result.checks.some((check) => !check.passes)).toBe(true);
  });

  it("rejects a malformed hex rather than silently defaulting", () => {
    expect(checkBrandColor("not-a-colour").valid).toBe(false);
  });

  it("computes the WCAG reference ratio for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("picks readable text for a colour panel", () => {
    expect(readableTextOn("#1D4ED8")).toBe("#FFFFFF");
    expect(readableTextOn("#FDE68A")).toBe("#0F172A");
  });
});
