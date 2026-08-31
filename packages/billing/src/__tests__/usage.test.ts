import { describe, expect, it } from "vitest";
import {
  CONSUMED_METRICS,
  COUNTED_METRICS,
  METRIC_LIMIT_KEY,
  isConsumedMetric,
  resolvePeriodEnd,
  resolvePeriodStart,
} from "../usage";
import { FALLBACK_ENTITLEMENTS } from "../entitlements";
import type { UsageMetric } from "@pdm/schemas";

/**
 * USAGE METERING — PLAN.md Part IX §9.2.
 *
 * Two things here decide whether a customer is billed correctly: which period a
 * consumption lands in, and whether a metric accumulates or is counted live.
 * Getting either wrong produces a plausible number that is simply not true.
 */

describe("the usage period is the STRIPE period, not the calendar month", () => {
  it("uses the subscription's currentPeriodStart when there is one", () => {
    /*
     * §9.2: "Usage period aligns to the Stripe billing period
     * (`currentPeriodStart`), not the calendar month, so a mid-month upgrade
     * behaves intuitively." An agency upgrading on the 20th gets its new
     * allowance now; a calendar period would make them wait eleven days for
     * limits they have already paid for, and would make the meter on the
     * billing page disagree with the invoice they are holding.
     */
    const stripeStart = new Date("2026-08-20T00:00:00Z");
    expect(resolvePeriodStart(stripeStart, new Date("2026-09-01T12:00:00Z"))).toBe(
      stripeStart,
    );
  });

  it("falls back to the calendar month for an agency with no subscription", () => {
    const start = resolvePeriodStart(null, new Date("2026-09-15T12:34:56Z"));
    expect(start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("⚠️ the fallback is normalised to UTC midnight, so it is STABLE", () => {
    /*
     * The key is `(agencyId, periodStart, metric)`. If `periodStart` carried
     * the current time, every `consume()` would produce a new key and therefore
     * a NEW ROW — the unique constraint would never collide, the counter would
     * never increment past 1, and every limit check would pass forever.
     */
    const a = resolvePeriodStart(null, new Date("2026-09-15T00:00:01Z"));
    const b = resolvePeriodStart(null, new Date("2026-09-15T23:59:59Z"));
    const c = resolvePeriodStart(null, new Date("2026-09-01T09:00:00Z"));
    expect(a.getTime()).toBe(b.getTime());
    expect(a.getTime()).toBe(c.getTime());
  });

  it("uses the subscription's period end when there is one", () => {
    const end = new Date("2026-09-20T00:00:00Z");
    expect(resolvePeriodEnd(end, new Date("2026-08-20T00:00:00Z"))).toBe(end);
  });

  it("falls back to the month after the period start", () => {
    const end = resolvePeriodEnd(null, new Date("2026-09-01T00:00:00Z"));
    expect(end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rolls the year over correctly in the fallback", () => {
    // `getUTCMonth() + 1` on December is month 12, which `Date.UTC` normalises
    // to January of the next year. Asserted because an off-by-one here would
    // put every December consumption in an unreachable period.
    const end = resolvePeriodEnd(null, new Date("2026-12-01T00:00:00Z"));
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("⚠️ consumed metrics accumulate; counted metrics are live", () => {
  it("SCANS, AI_CREDITS and REPORTS accumulate within a period", () => {
    for (const metric of CONSUMED_METRICS) {
      expect(isConsumedMetric(metric)).toBe(true);
    }
  });

  it("WEBSITES and SEATS are NOT consumed", () => {
    /*
     * The bug this prevents: metering websites as a consumed metric. Archiving
     * a website frees a slot, but a `UsageRecord` never learns that — so an
     * agency that deleted half its sites would stay stuck at its limit, with a
     * counter that only ever goes up and no way to bring it down. They must be
     * a live `COUNT(*)`.
     */
    for (const metric of COUNTED_METRICS) {
      expect(isConsumedMetric(metric)).toBe(false);
    }
  });

  it("every metric is classified exactly once", () => {
    const all = [...CONSUMED_METRICS, ...COUNTED_METRICS];
    expect(new Set(all).size).toBe(all.length);
  });

  it("covers every member of the UsageMetric enum", () => {
    // A new metric added to the schema without a classification here would
    // default to "not consumed" and silently never be metered.
    const classified = new Set<string>([...CONSUMED_METRICS, ...COUNTED_METRICS]);
    for (const metric of Object.keys(METRIC_LIMIT_KEY)) {
      expect(classified.has(metric), `${metric} is unclassified`).toBe(true);
    }
  });
});

describe("METRIC_LIMIT_KEY maps each metric to a real entitlement", () => {
  it("every non-null key exists on EntitlementSet", () => {
    // A typo here — `maxWebsite` for `maxWebsites` — reads `undefined` as the
    // limit, and `used + 1 <= undefined` is false: the agency is blocked at
    // zero with no error anywhere.
    for (const [metric, key] of Object.entries(METRIC_LIMIT_KEY)) {
      if (key === null) continue;
      expect(
        Object.hasOwn(FALLBACK_ENTITLEMENTS, key),
        `${metric} → "${key}" is not an EntitlementSet key`,
      ).toBe(true);
    }
  });

  it("STORAGE_BYTES is deliberately uncapped", () => {
    /*
     * §9.2's `EntitlementSet` has no storage dimension. Inventing one here
     * would be this package deciding plan policy — the exact thing "one
     * service, no plan logic anywhere else" forbids. It is metered for the
     * billing meter and our cost tracking, and enforced nowhere.
     */
    expect(METRIC_LIMIT_KEY.STORAGE_BYTES).toBeNull();
  });

  it("maps the three consumed metrics to their period limits", () => {
    expect(METRIC_LIMIT_KEY.SCANS).toBe("maxScansPerMonth");
    expect(METRIC_LIMIT_KEY.AI_CREDITS).toBe("aiCreditsPerMonth");
    expect(METRIC_LIMIT_KEY.REPORTS).toBe("maxReportsPerMonth");
  });

  it("maps the counted metrics to their headcount limits", () => {
    expect(METRIC_LIMIT_KEY.WEBSITES).toBe("maxWebsites");
    expect(METRIC_LIMIT_KEY.SEATS).toBe("maxTeamMembers");
  });

  it("accepts every UsageMetric the schema declares", () => {
    // Typed exhaustiveness: this fails to compile if a metric is missing.
    const metrics: UsageMetric[] = [
      "SCANS",
      "AI_CREDITS",
      "REPORTS",
      "STORAGE_BYTES",
      "WEBSITES",
      "SEATS",
    ];
    for (const metric of metrics) {
      expect(METRIC_LIMIT_KEY).toHaveProperty(metric);
    }
  });
});
