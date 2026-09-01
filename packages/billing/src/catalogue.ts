import type { EntitlementSet } from "./entitlements";
import type { SupportedCurrency } from "./stripe";

/**
 * THE PLAN CATALOGUE — PLAN.md Part IX §9.3, Phase 6 tasks 6.1/6.3/6.4.
 *
 * ⚠️ §9.3's TABLE, ONCE. Before this file the same numbers existed in three
 * places — `prisma/seed.ts` (USD + entitlements), `prisma/stripe-provision.ts`
 * (all three currencies) and, had it been written independently, the `/pricing`
 * page. Three copies of a price list is a pricing bug waiting for the first
 * change: the seed says $149, Stripe charges $169, and the page advertises
 * whichever was edited last. All three now import from here.
 *
 * ⚠️ THE GBP AND EUR FIGURES ARE PRICE POINTS, NOT CONVERSIONS. §9.3 fixes
 * £39/€45 against $49; they are chosen numbers, and recomputing them from an
 * exchange rate at render time would produce £38.71 on a pricing page — which
 * looks like a bug and changes daily. `stripe-provision.ts` says the same thing
 * about the Stripe Prices it creates from them.
 *
 * ⚠️ THIS IS THE ADVERTISED CATALOGUE, NOT AN AGENCY'S ENTITLEMENTS. What an
 * agency actually gets is resolved by `resolveEntitlements` from the DATABASE
 * row plus overrides plus status — never from here. A support-granted override
 * must not be overwritten by a constant.
 */

export interface CataloguePrices {
  monthly: number;
  annual: number;
}

export interface CataloguePlan {
  key: string;
  name: string;
  description: string;
  sortOrder: number;
  /** Minor units, per currency. USD is authoritative — §9.3 bills in USD. */
  prices: Record<SupportedCurrency, CataloguePrices>;
  entitlements: EntitlementSet;
  /** §3.2: "the 'Most popular' plan is visually elevated". §9.3: Growth. */
  featured?: boolean;
}

export const PLAN_CATALOGUE: readonly CataloguePlan[] = [
  {
    key: "starter",
    name: "Starter",
    description: "For agencies getting started with privacy monitoring.",
    sortOrder: 1,
    prices: {
      usd: { monthly: 4_900, annual: 49_000 },
      gbp: { monthly: 3_900, annual: 39_000 },
      eur: { monthly: 4_500, annual: 45_000 },
    },
    entitlements: {
      maxWebsites: 10,
      maxTeamMembers: 2,
      maxClients: 10,
      scanFrequencies: ["WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 60,
      maxPagesPerScan: 1,
      maxConcurrentScans: 1,
      scanPriority: "NORMAL",
      aiCreditsPerMonth: 50,
      aiAdvancedTier: false,
      whiteLabel: false,
      clientPortal: false,
      maxPortalUsers: 0,
      reportTypes: ["SCAN", "WEBSITE_HEALTH"],
      maxReportsPerMonth: 10,
      evidenceRetentionDays: 30,
      scanHistoryRetentionDays: 365,
      slackIntegration: false,
      webhooks: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    key: "growth",
    name: "Growth",
    description: "Daily scanning and white-label reports. The one most agencies pick.",
    sortOrder: 2,
    featured: true,
    prices: {
      usd: { monthly: 14_900, annual: 149_000 },
      gbp: { monthly: 11_900, annual: 119_000 },
      eur: { monthly: 13_900, annual: 139_000 },
    },
    entitlements: {
      maxWebsites: 40,
      maxTeamMembers: 6,
      maxClients: 40,
      scanFrequencies: ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 400,
      maxPagesPerScan: 3,
      maxConcurrentScans: 2,
      scanPriority: "NORMAL",
      aiCreditsPerMonth: 300,
      aiAdvancedTier: false,
      whiteLabel: true,
      clientPortal: true,
      maxPortalUsers: 10,
      reportTypes: [
        "SCAN",
        "ISSUE",
        "MONTHLY_MONITORING",
        "WEBSITE_HEALTH",
        "PRIVACY_DRIFT",
      ],
      maxReportsPerMonth: 50,
      evidenceRetentionDays: 90,
      scanHistoryRetentionDays: 730,
      slackIntegration: false,
      webhooks: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    key: "agency",
    name: "Agency",
    description: "Larger portfolios, advanced AI, priority support.",
    sortOrder: 3,
    prices: {
      usd: { monthly: 34_900, annual: 349_000 },
      gbp: { monthly: 27_900, annual: 279_000 },
      eur: { monthly: 32_500, annual: 325_000 },
    },
    entitlements: {
      maxWebsites: 120,
      maxTeamMembers: 15,
      maxClients: 120,
      scanFrequencies: ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 1500,
      maxPagesPerScan: 5,
      maxConcurrentScans: 4,
      scanPriority: "HIGH",
      aiCreditsPerMonth: 1000,
      aiAdvancedTier: true,
      whiteLabel: true,
      clientPortal: true,
      maxPortalUsers: 50,
      reportTypes: [
        "SCAN",
        "ISSUE",
        "MONTHLY_MONITORING",
        "WEBSITE_HEALTH",
        "PRIVACY_DRIFT",
      ],
      maxReportsPerMonth: 200,
      evidenceRetentionDays: 180,
      scanHistoryRetentionDays: 1095,
      slackIntegration: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
  {
    key: "scale",
    name: "Scale",
    description: "For agencies managing hundreds of client websites.",
    sortOrder: 4,
    prices: {
      usd: { monthly: 79_900, annual: 799_000 },
      gbp: { monthly: 63_900, annual: 639_000 },
      eur: { monthly: 74_500, annual: 745_000 },
    },
    entitlements: {
      maxWebsites: 400,
      /*
       * ⚠️ `-1`, NOT `0`, AND NOT A LARGE NUMBER. §9.2 fixes -1 as unlimited;
       * `isUnlimited()` is the only thing that may compare against it, because
       * `used >= limit` with limit === -1 is TRUE and would block a Scale agency
       * on its first team member.
       */
      maxTeamMembers: -1,
      maxClients: -1,
      scanFrequencies: ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 6000,
      maxPagesPerScan: 10,
      maxConcurrentScans: 8,
      scanPriority: "HIGH",
      aiCreditsPerMonth: 4000,
      aiAdvancedTier: true,
      whiteLabel: true,
      clientPortal: true,
      maxPortalUsers: -1,
      reportTypes: [
        "SCAN",
        "ISSUE",
        "MONTHLY_MONITORING",
        "WEBSITE_HEALTH",
        "PRIVACY_DRIFT",
      ],
      maxReportsPerMonth: -1,
      evidenceRetentionDays: 365,
      scanHistoryRetentionDays: 1095,
      slackIntegration: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
];

/**
 * §9.3: "Annual (2 mo free)".
 *
 * ⚠️ DERIVED FROM THE TWO PRICES, NEVER HARD-CODED AS "17%". The saving is
 * whatever the table says it is; asserting a percentage separately is how a
 * pricing page ends up advertising a discount the invoice does not give.
 */
export function annualSavingMinorUnits(
  plan: CataloguePlan,
  currency: SupportedCurrency,
): number {
  const prices = plan.prices[currency];
  return prices.monthly * 12 - prices.annual;
}
