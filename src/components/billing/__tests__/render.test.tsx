import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FALLBACK_ENTITLEMENTS, PLAN_CATALOGUE } from "@pdm/billing";
import type { UsageSummary } from "@pdm/billing";
import { BillingBanners } from "../billing-banners";
import { InvoiceTable } from "../invoice-table";
import { PlanCard } from "../plan-card";
import { PlanPicker } from "../plan-picker";
import { UsageMeters } from "../usage-meters";
import { PricingTable } from "@/components/marketing/pricing-table";
import type { BillingPageData } from "@/server/queries/billing";

/**
 * RENDER SMOKE TESTS — Phase 6 tasks 6.3/6.4.
 *
 * ⚠️ A TYPECHECK IS NOT A RENDER, and this project has already paid for the
 * difference: AGENTS.md defect 3 records three `.tsx` files that `tsc` accepted
 * and that threw "React is not defined" the first time anything rendered them.
 * These assertions are deliberately shallow — they prove the tree renders and
 * that the few values a customer would notice being wrong are right.
 *
 * ⚠️ THEY ARE NOT A SUBSTITUTE FOR LOOKING AT THE PAGE. `renderToStaticMarkup`
 * runs no effects and applies no CSS. The browser pass over the authenticated
 * surfaces lands with the Phase 7 E2E harness, which needs a real Clerk session.
 */

const PERIOD_START = new Date("2026-09-01T00:00:00Z");
const PERIOD_END = new Date("2026-10-01T00:00:00Z");

function usage(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    metric: "WEBSITES",
    used: 4,
    limit: 10,
    remaining: 6,
    nearingLimit: false,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    ...overrides,
  };
}

const BASE: BillingPageData = {
  planName: "Growth",
  planKey: "growth",
  status: "ACTIVE",
  interval: "MONTHLY",
  priceCents: 14_900,
  currency: "usd",
  currentPeriodEnd: PERIOD_END,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  trialDaysLeft: null,
  readOnly: false,
  entitlements: FALLBACK_ENTITLEMENTS,
  usage: [usage()],
  plans: PLAN_CATALOGUE.map((plan) => ({
    key: plan.key,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: plan.prices.usd.monthly,
    priceAnnualCents: plan.prices.usd.annual,
    currency: "usd",
    entitlements: plan.entitlements,
    current: plan.key === "growth",
  })),
  stripe: {
    invoices: [],
    paymentMethod: null,
    billingEmail: null,
    taxIds: [],
    available: true,
  },
  overLimit: [],
  grace: { state: "clear", excess: 0, endsAt: null, daysLeft: null },
};

describe("billing page components", () => {
  it("renders the plan card with the plan, the price and the renewal date", () => {
    const html = renderToStaticMarkup(
      <PlanCard data={BASE} timeZone="Europe/London" canManage />,
    );
    expect(html).toContain("Growth");
    expect(html).toContain("$149");
    expect(html).toContain("Renews");
  });

  it('says "Access ends" — not "Renews" — when a cancellation is scheduled', () => {
    /*
     * ⚠️ THE SAME DATE MEANS TWO OPPOSITE THINGS. Printing "Renews 1 Oct" to
     * somebody who has cancelled is how a refund request starts.
     */
    const html = renderToStaticMarkup(
      <PlanCard
        data={{ ...BASE, cancelAtPeriodEnd: true }}
        timeZone="Europe/London"
        canManage
      />,
    );
    expect(html).toContain("Access ends");
    expect(html).not.toContain("Renews");
  });

  it("draws an over-limit meter past its limit without clipping the number", () => {
    const html = renderToStaticMarkup(
      <UsageMeters
        usage={[usage({ used: 14, limit: 10, remaining: 0, nearingLimit: true })]}
        timeZone="Europe/London"
      />,
    );
    // The bar is clamped to 100%; the numbers beside it are not.
    expect(html).toContain("14");
    expect(html).toContain("width:100%");
  });

  it("renders an unlimited meter with no progress bar at all", () => {
    // `used / -1` is negative — a bar drawn against an unlimited limit is either
    // invisible or nonsense, so there must not be one.
    const html = renderToStaticMarkup(
      <UsageMeters
        usage={[usage({ metric: "SEATS", limit: -1, remaining: null, used: 9 })]}
        timeZone="Europe/London"
      />,
    );
    expect(html).toContain("Unlimited");
    expect(html).not.toContain("progressbar");
  });

  it("read-only renders a banner that says what still works", () => {
    const html = renderToStaticMarkup(
      <BillingBanners data={{ ...BASE, status: "PAST_DUE", readOnly: true }} />,
    );
    expect(html).toContain("New scans are paused");
    // Feature doc 17 rule 3 — the banner must not imply data has been withheld.
    expect(html).toContain("stays available");
  });

  it("a grace banner never threatens deletion", () => {
    const html = renderToStaticMarkup(
      <BillingBanners
        data={{
          ...BASE,
          overLimit: [usage({ used: 14, limit: 10, remaining: 0 })],
          grace: {
            state: "grace",
            excess: 4,
            endsAt: new Date("2026-09-15T00:00:00Z"),
            daysLeft: 6,
          },
        }}
      />,
    );
    expect(html).toContain("Nothing has been removed");
    // The deadline is part of the message — see the note in BillingBanners.
    expect(html).toContain("6 days");
    expect(html.toLowerCase()).not.toContain("will be deleted");
  });

  it("distinguishes 'no invoices yet' from 'we could not reach Stripe'", () => {
    const empty = renderToStaticMarkup(
      <InvoiceTable stripe={BASE.stripe} timeZone="Europe/London" />,
    );
    expect(empty).toContain("No invoices yet");

    const down = renderToStaticMarkup(
      <InvoiceTable
        stripe={{ ...BASE.stripe, available: false }}
        timeZone="Europe/London"
      />,
    );
    expect(down).toContain("could not be loaded");
  });

  it("marks exactly one plan as current in the picker", () => {
    const html = renderToStaticMarkup(
      <PlanPicker plans={BASE.plans} currency="usd" hasSubscription />,
    );
    expect(html.split("Your plan").length - 1).toBe(1);
  });
});

describe("pricing table", () => {
  it("renders all four plans with §9.3's monthly prices", () => {
    const html = renderToStaticMarkup(<PricingTable />);
    for (const price of ["$49", "$149", "$349", "$799"]) {
      expect(html).toContain(price);
    }
    expect(html).toContain("Most popular");
  });

  it("prints 36 months of scan history for Agency, not 37", () => {
    // 1095 days / 30 rounds to 37 — a month we do not sell. §9.3 says 36.
    const html = renderToStaticMarkup(<PricingTable />);
    expect(html).toContain("36 months");
    expect(html).not.toContain("37 months");
  });
});
