import { describe, expect, it } from "vitest";
import {
  FALLBACK_ENTITLEMENTS,
  NEARING_LIMIT_THRESHOLD,
  UNLIMITED,
  checkLimit,
  isReadOnly,
  isUnlimited,
  resolveEntitlements,
  type SubscriptionStatusName,
} from "../entitlements";

/**
 * ENTITLEMENT RESOLUTION — PLAN.md Part IX §9.2.
 *
 * ⚠️ EVERY ASSERTION HERE IS A BILLING DISPUTE THAT DID NOT HAPPEN. Feature
 * doc 17: plan logic scattered across call sites "becomes nine different
 * interpretations of what does Professional include, which is a support and
 * billing-dispute generator". This file is what makes the one interpretation
 * checkable — a customer told they get 40 websites and blocked at 39 is a
 * refund, and nothing in the type system prevents it.
 */

const GROWTH = {
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
  reportTypes: ["SCAN", "ISSUE", "MONTHLY_MONITORING", "WEBSITE_HEALTH", "PRIVACY_DRIFT"],
  maxReportsPerMonth: 50,
  evidenceRetentionDays: 90,
  scanHistoryRetentionDays: 730,
  slackIntegration: false,
  webhooks: false,
  apiAccess: false,
  prioritySupport: false,
};

describe("layer 1 — plan defaults", () => {
  it("reads every dimension off the plan row", () => {
    const set = resolveEntitlements({ planEntitlements: GROWTH, status: "ACTIVE" });
    expect(set.maxWebsites).toBe(40);
    expect(set.whiteLabel).toBe(true);
    expect(set.scanFrequencies).toContain("DAILY");
    expect(set.reportTypes).toHaveLength(5);
  });

  it("falls back per-dimension on a malformed plan row, not wholesale", () => {
    /*
     * ⚠️ `Plan.entitlements` is a `Json` column. A seed bug that writes
     * `"40"` instead of `40` must degrade ONE dimension, not corrupt the set —
     * `used >= "40"` is a string comparison that silently does the wrong thing.
     */
    const set = resolveEntitlements({
      planEntitlements: { ...GROWTH, maxWebsites: "40", whiteLabel: "yes" },
      status: "ACTIVE",
    });
    expect(set.maxWebsites).toBe(FALLBACK_ENTITLEMENTS.maxWebsites);
    expect(set.whiteLabel).toBe(FALLBACK_ENTITLEMENTS.whiteLabel);
    // Everything valid on the same row still comes through.
    expect(set.maxScansPerMonth).toBe(400);
  });

  it("rejects NaN and Infinity as limits", () => {
    // `Infinity` would pass every check while looking like a deliberate
    // "unlimited" that is not the `-1` §9.2 specifies.
    const set = resolveEntitlements({
      planEntitlements: { ...GROWTH, maxWebsites: Infinity, maxClients: NaN },
      status: "ACTIVE",
    });
    expect(set.maxWebsites).toBe(FALLBACK_ENTITLEMENTS.maxWebsites);
    expect(set.maxClients).toBe(FALLBACK_ENTITLEMENTS.maxClients);
  });

  it("falls back entirely when there is no plan row at all", () => {
    // A brand-new agency, seconds after signup, before Stripe exists. It must
    // be usable — that first minute decides activation.
    const set = resolveEntitlements({ planEntitlements: null });
    expect(set).toEqual(FALLBACK_ENTITLEMENTS);
  });
});

describe("layer 2 — admin-granted overrides", () => {
  it("an override beats the plan default", () => {
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      overrides: { maxWebsites: 75 },
      status: "ACTIVE",
    });
    expect(set.maxWebsites).toBe(75);
  });

  it("overrides only the named dimensions", () => {
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      overrides: { maxWebsites: 75 },
      status: "ACTIVE",
    });
    expect(set.maxScansPerMonth).toBe(400);
    expect(set.whiteLabel).toBe(true);
  });

  it("can grant a boolean feature the plan withholds", () => {
    // The support case this exists for: "we promised them white-label on
    // Starter for the pilot".
    const set = resolveEntitlements({
      planEntitlements: { ...GROWTH, apiAccess: false },
      overrides: { apiAccess: true },
      status: "ACTIVE",
    });
    expect(set.apiAccess).toBe(true);
  });

  it("can grant UNLIMITED", () => {
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      overrides: { maxWebsites: UNLIMITED },
      status: "ACTIVE",
    });
    expect(isUnlimited(set.maxWebsites)).toBe(true);
  });

  it("ignores a malformed override and keeps the plan value", () => {
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      overrides: { maxWebsites: "lots" },
      status: "ACTIVE",
    });
    expect(set.maxWebsites).toBe(40);
  });
});

describe("layer 3 — status modifiers", () => {
  const READ_ONLY: SubscriptionStatusName[] = [
    "PAST_DUE",
    "UNPAID",
    "CANCELED",
    "INCOMPLETE_EXPIRED",
    "PAUSED",
  ];
  const ACTIVE: SubscriptionStatusName[] = ["ACTIVE", "TRIALING", "INCOMPLETE"];

  for (const status of READ_ONLY) {
    it(`${status} zeroes the two METERED resources`, () => {
      const set = resolveEntitlements({ planEntitlements: GROWTH, status });
      expect(set.maxScansPerMonth).toBe(0);
      expect(set.aiCreditsPerMonth).toBe(0);
      expect(isReadOnly(status)).toBe(true);
    });

    it(`${status} does NOT hide or shrink anything the agency already has`, () => {
      /*
       * ⚠️ THE MOST IMPORTANT ASSERTION IN THIS FILE. Feature doc 17, rule 3:
       * "Payment failure degrades to read-only scanning without hiding data.
       * The agency keeps access to everything it has; it just stops generating
       * new scans. Hiding data on non-payment is hostile and a support
       * disaster."
       *
       * `evidenceRetentionDays` in particular: the retention sweep READS it, so
       * shrinking it here would irreversibly DELETE a customer's evidence over
       * an expired card.
       */
      const set = resolveEntitlements({ planEntitlements: GROWTH, status });
      expect(set.evidenceRetentionDays).toBe(90);
      expect(set.scanHistoryRetentionDays).toBe(730);
      expect(set.maxWebsites).toBe(40);
      expect(set.clientPortal).toBe(true);
      expect(set.reportTypes).toHaveLength(5);
      expect(set.whiteLabel).toBe(true);
    });
  }

  for (const status of ACTIVE) {
    it(`${status} leaves the metered resources intact`, () => {
      const set = resolveEntitlements({ planEntitlements: GROWTH, status });
      expect(set.maxScansPerMonth).toBe(400);
      expect(set.aiCreditsPerMonth).toBe(300);
    });
  }

  it("an EXPIRED trial is read-only even though the status is TRIALING", () => {
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      status: "TRIALING",
      trialEndsAt: new Date("2026-01-01"),
      now: new Date("2026-02-01"),
    });
    expect(set.maxScansPerMonth).toBe(0);
    // …and still shows them everything they produced during the trial.
    expect(set.maxWebsites).toBe(40);
  });

  it("a trial still running is not read-only", () => {
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      status: "TRIALING",
      trialEndsAt: new Date("2026-03-01"),
      now: new Date("2026-02-01"),
    });
    expect(set.maxScansPerMonth).toBe(400);
  });

  it("⚠️ a status modifier OUTRANKS an admin override", () => {
    /*
     * Order is `plan → overrides → status`, and status last is deliberate:
     * otherwise "support granted extra AI credits" keeps a non-paying agency
     * spending our provider budget indefinitely. The grant is preserved and
     * returns the moment the account is current.
     */
    const set = resolveEntitlements({
      planEntitlements: GROWTH,
      overrides: { aiCreditsPerMonth: 5000, maxScansPerMonth: 9999 },
      status: "PAST_DUE",
    });
    expect(set.aiCreditsPerMonth).toBe(0);
    expect(set.maxScansPerMonth).toBe(0);
  });
});

describe("UNLIMITED is -1, and it is not a large number", () => {
  it("distinguishes unlimited from none", () => {
    expect(isUnlimited(UNLIMITED)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
  });

  it("⚠️ an unlimited plan does not block on its first item", () => {
    /*
     * The single easiest catastrophic bug in this package: `used >= limit` with
     * `limit === -1` is TRUE for every non-negative `used`, so Scale's
     * "unlimited team members" would reject the first invite.
     */
    expect(checkLimit(0, UNLIMITED).allowed).toBe(true);
    expect(checkLimit(10_000, UNLIMITED).allowed).toBe(true);
  });

  it("reports unlimited as null, never as -1, so a meter cannot draw it", () => {
    const check = checkLimit(5, UNLIMITED);
    expect(check.limit).toBeNull();
    expect(check.remaining).toBeNull();
    expect(check.nearingLimit).toBe(false);
  });
});

describe("checkLimit arithmetic", () => {
  it("allows consuming exactly up to the limit", () => {
    expect(checkLimit(39, 40).allowed).toBe(true);
    expect(checkLimit(40, 40).allowed).toBe(false);
  });

  it("⚠️ blocks a multi-unit action that would cross the limit", () => {
    // An advanced AI call costs 3 credits. With 2 left it must be refused, not
    // allowed to finish 1 over — a cap exceedable by one action is not a cap.
    expect(checkLimit(298, 300, 3).allowed).toBe(false);
    expect(checkLimit(297, 300, 3).allowed).toBe(true);
  });

  it("never reports negative remaining, even when already over", () => {
    // An agency can be over its limit after a downgrade (§9.2 grace). The meter
    // must read 0 remaining, not -15.
    const check = checkLimit(55, 40);
    expect(check.remaining).toBe(0);
    expect(check.allowed).toBe(false);
  });

  it("flags nearing at 80%", () => {
    expect(checkLimit(32, 40).nearingLimit).toBe(true);
    expect(checkLimit(31, 40).nearingLimit).toBe(false);
    expect(NEARING_LIMIT_THRESHOLD).toBe(0.8);
  });

  it("a limit of ZERO is 'none allowed', not 'nearing'", () => {
    // Read-only agencies have maxScansPerMonth: 0. `0/0` is NaN and would make
    // the banner say "you are nearing your limit of 0".
    const check = checkLimit(0, 0);
    expect(check.allowed).toBe(false);
    expect(check.nearingLimit).toBe(false);
  });
});

describe("§9.3's pricing table resolves as published", () => {
  /*
   * ⚠️ THE PUBLISHED PRICE PAGE IS A PROMISE. These are the numbers in §9.3 and
   * on `/pricing`; if the resolver returns anything else, we are selling one
   * thing and delivering another.
   */
  const PLANS = {
    starter: { maxWebsites: 10, maxScansPerMonth: 60, maxTeamMembers: 2, aiCreditsPerMonth: 50, whiteLabel: false, clientPortal: false },
    growth: { maxWebsites: 40, maxScansPerMonth: 400, maxTeamMembers: 6, aiCreditsPerMonth: 300, whiteLabel: true, clientPortal: true },
    agency: { maxWebsites: 120, maxScansPerMonth: 1500, maxTeamMembers: 15, aiCreditsPerMonth: 1000, whiteLabel: true, clientPortal: true },
    scale: { maxWebsites: 400, maxScansPerMonth: 6000, maxTeamMembers: UNLIMITED, aiCreditsPerMonth: 4000, whiteLabel: true, clientPortal: true },
  } as const;

  for (const [name, expected] of Object.entries(PLANS)) {
    it(`${name} resolves to its published limits`, () => {
      const set = resolveEntitlements({ planEntitlements: expected, status: "ACTIVE" });
      for (const [key, value] of Object.entries(expected)) {
        expect(set[key as keyof typeof set], `${name}.${key}`).toBe(value);
      }
    });
  }

  it("only Starter withholds white-label — the Growth upgrade trigger", () => {
    // §9.3: "White-label starts at Growth because it is the feature that turns
    // the product into a resellable service."
    expect(PLANS.starter.whiteLabel).toBe(false);
    expect(PLANS.growth.whiteLabel).toBe(true);
  });

  it("Scale's unlimited seats are -1, and unlimited in practice", () => {
    const set = resolveEntitlements({ planEntitlements: PLANS.scale, status: "ACTIVE" });
    expect(checkLimit(999, set.maxTeamMembers).allowed).toBe(true);
  });
});
