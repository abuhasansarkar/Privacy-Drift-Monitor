/**
 * USAGE METERING — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * §9.2: "Usage counters are `UsageRecord` rows upserted with an atomic
 * `increment`, keyed `(agencyId, periodStart, metric)` — the unique constraint
 * makes double-counting impossible under concurrency."
 *
 * ⚠️ THE UNIQUE CONSTRAINT IS THE CONCURRENCY CONTROL, NOT THE UPSERT. Two
 * workers consuming a scan at the same instant both find no row, both try to
 * create one, and exactly one wins — the loser gets a P2002 and retries into the
 * update branch. Without `@@unique([agencyId, periodStart, metric])` (which
 * §5 already declares) both creates succeed and the agency is billed for one
 * scan instead of two. Prisma's `upsert` alone does NOT prevent this; the
 * database constraint does.
 *
 * ⚠️ `{ increment: n }`, NEVER read-then-write. `usage.quantity + n` computed in
 * application code is a lost update the moment two workers interleave, and the
 * symptom is a customer who ran 400 scans being billed for 380 — undetectable
 * without reconciliation, which is exactly why §9.2 also asks for a
 * reconciliation job.
 */

import type { UsageMetric } from "@pdm/schemas";

/**
 * The billing period a usage row belongs to.
 *
 * ⚠️ THE STRIPE PERIOD, NOT THE CALENDAR MONTH. §9.2: "Usage period aligns to
 * the Stripe billing period (`currentPeriodStart`), not the calendar month, so a
 * mid-month upgrade behaves intuitively." An agency that upgrades on the 20th
 * gets its new allowance immediately; a calendar-month period would make them
 * wait eleven days for limits they have already paid for, and would make the
 * meter on the billing page disagree with the invoice.
 *
 * ⚠️ THE CALENDAR FALLBACK IS FOR AN AGENCY WITH NO SUBSCRIPTION YET, and it is
 * deliberately UTC-normalised to midnight so the same period always produces the
 * same key. A `new Date()` here would make every consume() write a new row.
 */
export function resolvePeriodStart(
  currentPeriodStart: Date | null | undefined,
  now = new Date(),
): Date {
  if (currentPeriodStart) return currentPeriodStart;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function resolvePeriodEnd(
  currentPeriodEnd: Date | null | undefined,
  periodStart: Date,
): Date {
  if (currentPeriodEnd) return currentPeriodEnd;
  return new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );
}

/**
 * Which entitlement dimension caps which metric.
 *
 * ⚠️ NOT EVERY METRIC IS METERED THE SAME WAY, and conflating them is how a
 * limit gets enforced against the wrong number:
 *
 *   SCANS, AI_CREDITS, REPORTS  — CONSUMED. They accumulate within a period and
 *                                 reset at the next one. A `UsageRecord` is the
 *                                 source of truth.
 *   WEBSITES, SEATS             — COUNTED. They are a live `COUNT(*)`, not an
 *                                 accumulation: archiving a website frees a
 *                                 slot, and a `UsageRecord` would never learn
 *                                 that. Checking these against a stored counter
 *                                 is how an agency gets stuck at its limit after
 *                                 deleting half its sites.
 *   STORAGE_BYTES               — COUNTED, and not yet enforced anywhere.
 */
export const CONSUMED_METRICS = ["SCANS", "AI_CREDITS", "REPORTS"] as const;
export const COUNTED_METRICS = ["WEBSITES", "SEATS", "STORAGE_BYTES"] as const;

export type ConsumedMetric = (typeof CONSUMED_METRICS)[number];
export type CountedMetric = (typeof COUNTED_METRICS)[number];

export function isConsumedMetric(metric: UsageMetric): metric is ConsumedMetric {
  return (CONSUMED_METRICS as readonly string[]).includes(metric);
}

/** metric → the `EntitlementSet` key that caps it. */
export const METRIC_LIMIT_KEY = {
  WEBSITES: "maxWebsites",
  SEATS: "maxTeamMembers",
  SCANS: "maxScansPerMonth",
  AI_CREDITS: "aiCreditsPerMonth",
  REPORTS: "maxReportsPerMonth",
  /**
   * ⚠️ NO LIMIT DIMENSION. §9.2's `EntitlementSet` has no storage cap, and
   * inventing one here would be this file deciding plan policy — the exact
   * thing §9.2's "one service, no plan logic anywhere else" forbids. Storage is
   * metered for the billing page's meter and for our own cost tracking, and
   * enforced nowhere.
   */
  STORAGE_BYTES: null,
} as const satisfies Record<UsageMetric, string | null>;

export interface UsageSummary {
  metric: UsageMetric;
  used: number;
  /** `null` = unlimited, or (for STORAGE_BYTES) uncapped by design. */
  limit: number | null;
  remaining: number | null;
  nearingLimit: boolean;
  periodStart: Date;
  periodEnd: Date;
}
