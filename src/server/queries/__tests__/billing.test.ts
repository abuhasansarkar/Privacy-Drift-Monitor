import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@pdm/database";
import { makeAgency, makeWebsite, resetDatabase } from "@pdm/database/testing";
import type { AgencyContext } from "@/server/auth/context";

/**
 * BILLING PAGE DATA — PLAN.md §3.11, §9.2, Phase 6 task 6.3.
 *
 * ⚠️ STRIPE IS MOCKED, POSTGRES IS NOT. The claims this suite makes are about
 * OUR projection — which plan is current, how many days of trial are left,
 * whether a downgrade left the agency over a limit. Every one of those is a
 * database read. The Stripe side is a network call to a third party, and a test
 * that reaches it would be slow, flaky, and dependent on a key that is
 * deliberately absent in CI.
 */
vi.mock("@/server/services/billing", () => ({
  getStripeSideData: vi.fn(async () => ({
    invoices: [],
    paymentMethod: null,
    billingEmail: null,
    taxIds: [],
    available: true,
  })),
}));

const { getBillingPageData } = await import("@/server/queries/billing");

function contextFor(agencyId: string, agencyName: string): AgencyContext {
  return {
    userId: "user-test",
    clerkUserId: "clerk-test",
    agencyId,
    agencyName,
    role: "OWNER",
    websiteScope: [],
    timezone: "Europe/London",
  };
}

async function planId(key: string): Promise<string> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key } });
  return plan.id;
}

describe("getBillingPageData", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("reports no plan, and still returns usable entitlements, before any subscription", async () => {
    const agency = await makeAgency();

    const data = await getBillingPageData(contextFor(agency.id, agency.name));

    expect(data.planName).toBeNull();
    expect(data.status).toBeNull();
    /*
     * ⚠️ THE FALLBACK IS SMALL, NEVER ZERO. An agency seconds after signup has
     * no subscription row; zeroing it would make the product unusable in the
     * minute that decides activation (see FALLBACK_ENTITLEMENTS).
     */
    expect(data.entitlements.maxWebsites).toBeGreaterThan(0);
    // The picker still needs the catalogue, or a new agency cannot buy anything.
    expect(data.plans.length).toBeGreaterThanOrEqual(4);
    expect(data.plans.every((plan) => plan.current === false)).toBe(true);
  });

  it("marks exactly one plan as current and prices it by the subscription interval", async () => {
    const agency = await makeAgency();
    await prisma.subscription.create({
      data: {
        agencyId: agency.id,
        planId: await planId("growth"),
        stripeCustomerId: `cus_${agency.id}`,
        status: "ACTIVE",
        interval: "ANNUAL",
      },
    });

    const data = await getBillingPageData(contextFor(agency.id, agency.name));

    expect(data.planKey).toBe("growth");
    expect(data.plans.filter((plan) => plan.current)).toHaveLength(1);
    // ANNUAL must price from `priceAnnualCents`; showing the monthly figure
    // beside "per year" is a support ticket about a 12× discrepancy.
    expect(data.priceCents).toBe(149_000);
  });

  it("counts trial days by CEILING, so the last partial day still reads as a day", async () => {
    const agency = await makeAgency();
    await prisma.subscription.create({
      data: {
        agencyId: agency.id,
        planId: await planId("starter"),
        stripeCustomerId: `cus_${agency.id}`,
        status: "TRIALING",
        // 30 hours out: 1.25 days. Flooring would say "1 day left" for a day and
        // a half and "0 days left" for the final 23 hours of a live trial.
        trialEndsAt: new Date(Date.now() + 30 * 3_600_000),
      },
    });

    const data = await getBillingPageData(contextFor(agency.id, agency.name));

    expect(data.trialDaysLeft).toBe(2);
    expect(data.readOnly).toBe(false);
  });

  it("PAST_DUE is read-only, and read-only never hides anything", async () => {
    const agency = await makeAgency();
    await prisma.subscription.create({
      data: {
        agencyId: agency.id,
        planId: await planId("growth"),
        stripeCustomerId: `cus_${agency.id}`,
        status: "PAST_DUE",
      },
    });

    const data = await getBillingPageData(contextFor(agency.id, agency.name));

    expect(data.readOnly).toBe(true);
    /*
     * ⚠️ FEATURE DOC 17 RULE 3. Read-only zeroes the two METERED resources and
     * touches nothing that governs viewing — the plan, the meters and the
     * invoice history all still render. An assertion that the page still has
     * its data is the only way this rule stays true after a refactor.
     */
    expect(data.planName).toBe("Growth");
    expect(data.usage.length).toBeGreaterThan(0);
    expect(data.entitlements.maxScansPerMonth).toBe(0);
    expect(data.entitlements.evidenceRetentionDays).toBeGreaterThan(0);
  });

  it("flags a downgrade that left the agency over a limit — and flags nothing at exactly the limit", async () => {
    const agency = await makeAgency();
    await prisma.subscription.create({
      data: {
        agencyId: agency.id,
        planId: await planId("starter"),
        stripeCustomerId: `cus_${agency.id}`,
        status: "ACTIVE",
        entitlementOverrides: { maxWebsites: 2 },
      },
    });

    await makeWebsite(agency.id);
    await makeWebsite(agency.id);

    // Exactly at the limit is a full plan, not a downgrade casualty.
    const atLimit = await getBillingPageData(contextFor(agency.id, agency.name));
    expect(atLimit.overLimit).toHaveLength(0);

    await makeWebsite(agency.id);

    const over = await getBillingPageData(contextFor(agency.id, agency.name));
    expect(over.overLimit.map((row) => row.metric)).toContain("WEBSITES");
  });
});
