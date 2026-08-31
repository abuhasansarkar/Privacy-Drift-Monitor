import "server-only";
import { cache } from "react";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  FALLBACK_ENTITLEMENTS,
  METRIC_LIMIT_KEY,
  checkLimit,
  isConsumedMetric,
  isReadOnly,
  resolveEntitlements,
  resolvePeriodEnd,
  resolvePeriodStart,
  type EntitlementSet,
  type LimitCheck,
  type SubscriptionStatusName,
  type UsageSummary,
} from "@pdm/billing";
import type { UsageMetric } from "@pdm/schemas";

/**
 * ENTITLEMENT SERVICE — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * **One service. No plan logic anywhere else.**
 *
 * ⚠️ THIS FILE IS THE I/O SHELL ONLY. Every decision — the three-layer
 * resolution, the read-only modifier, the limit arithmetic — lives in
 * `@pdm/billing`, which is pure and exhaustively tested without a database.
 * The split is what makes "one interpretation of what Growth includes" a
 * checkable claim rather than a hope.
 *
 * ⚠️ IT REPLACED A STUB THAT RETURNED `null` FOR EVERY LIMIT. Phase 1 built the
 * ENFORCEMENT POINT and deliberately left the rule empty, so that Phase 6 would
 * fill in one function instead of hunting call sites. That is what is happening
 * here — the call sites did not move.
 */

/**
 * §9.2 asks for a 5-minute cache. This is a per-REQUEST cache instead.
 *
 * ⚠️ AND THAT IS DELIBERATE, NOT A SHORTCUT. A 5-minute cross-request cache
 * means a webhook that upgrades an agency takes up to five minutes to take
 * effect — the customer pays, refreshes, and is still blocked. Worse in the
 * other direction: a `PAST_DUE` agency keeps consuming metered resources for
 * five minutes after the failure. React's `cache()` dedupes within one render
 * (a layout and three widgets asking is one query) and expires at the request
 * boundary, which is the property that actually mattered.
 *
 * If the query ever shows up in a latency profile, the right fix is Redis with
 * explicit invalidation from the webhook handler — not a blind TTL.
 */
export const getEntitlements = cache(
  async (agencyId: string): Promise<EntitlementSet> => {
    const repos = repositoriesFor(agencyId);
    const subscription = await repos.billing.subscription();

    if (!subscription) {
      // No Stripe customer yet — seconds after signup, or a locally seeded
      // agency. Usable, small, never zero. See FALLBACK_ENTITLEMENTS.
      return FALLBACK_ENTITLEMENTS;
    }

    return resolveEntitlements({
      planEntitlements: subscription.plan.entitlements,
      overrides: subscription.entitlementOverrides,
      status: subscription.status as SubscriptionStatusName,
      trialEndsAt: subscription.trialEndsAt,
    });
  },
);

/** Whether the agency is in the read-only state of §9.2 / feature doc 17 rule 3. */
export const getBillingState = cache(async (agencyId: string) => {
  const repos = repositoriesFor(agencyId);
  const subscription = await repos.billing.subscription();
  if (!subscription) {
    return { readOnly: false, status: null, trialEndsAt: null, planName: null } as const;
  }
  const status = subscription.status as SubscriptionStatusName;
  const trialExpired =
    status === "TRIALING" &&
    subscription.trialEndsAt != null &&
    subscription.trialEndsAt.getTime() <= Date.now();

  return {
    readOnly: isReadOnly(status) || trialExpired,
    status,
    trialEndsAt: subscription.trialEndsAt,
    planName: subscription.plan.name,
  } as const;
});

/**
 * Has the agency room for `quantity` more of `metric`?
 *
 * ⚠️ COUNTED METRICS ARE COUNTED LIVE; CONSUMED METRICS ARE READ FROM THE
 * LEDGER (§9.2). Websites and seats come from `COUNT(*)` because archiving a
 * site frees a slot — a stored counter would leave an agency stuck at its limit
 * after cleaning up, with no way down that is not deletion.
 */
export async function checkMetricLimit(
  agencyId: string,
  metric: UsageMetric,
  quantity = 1,
): Promise<LimitCheck> {
  const [entitlements, used] = await Promise.all([
    getEntitlements(agencyId),
    currentUsage(agencyId, metric),
  ]);

  const key = METRIC_LIMIT_KEY[metric];
  if (key === null) {
    // STORAGE_BYTES — metered, never capped. §9.2 defines no dimension for it,
    // and inventing one here would be a call site deciding plan policy.
    return { allowed: true, limit: null, used, remaining: null, nearingLimit: false };
  }

  return checkLimit(used, entitlements[key] as number, quantity);
}

async function currentUsage(agencyId: string, metric: UsageMetric): Promise<number> {
  const repos = repositoriesFor(agencyId);

  if (!isConsumedMetric(metric)) {
    const counts = await repos.billing.liveCounts();
    if (metric === "WEBSITES") return counts.websites;
    if (metric === "SEATS") return counts.seats;
    return 0; // STORAGE_BYTES — not yet metered.
  }

  const subscription = await repos.billing.subscription();
  const periodStart = resolvePeriodStart(subscription?.currentPeriodStart);
  return repos.billing.usageFor(periodStart, metric);
}

/**
 * Records consumption of a metered resource. Returns false if it would exceed.
 *
 * ⚠️ CHECK-THEN-CONSUME IS A RACE, AND IT IS AN ACCEPTED ONE — with a stated
 * bound. Two concurrent scans can each see 399/400 and both proceed, putting
 * the agency one over. The alternative is a serialisable transaction per scan,
 * which costs a lock on the hot path of the whole product to prevent an
 * overshoot bounded by `maxConcurrentScans` (1–8 by plan).
 *
 * What must NOT be raced is the COUNTER, and it is not: `consume` is an atomic
 * `increment` under a unique constraint, so the recorded total is always the
 * true total. We may allow 401 scans; we will never bill for 380.
 */
export async function consumeMetric(
  agencyId: string,
  metric: UsageMetric,
  quantity = 1,
): Promise<{ allowed: boolean; check: LimitCheck }> {
  const check = await checkMetricLimit(agencyId, metric, quantity);
  if (!check.allowed) return { allowed: false, check };

  if (!isConsumedMetric(metric)) {
    // Counted metrics have nothing to record — the row itself is the count.
    return { allowed: true, check };
  }

  const repos = repositoriesFor(agencyId);
  const subscription = await repos.billing.subscription();
  const periodStart = resolvePeriodStart(subscription?.currentPeriodStart);
  const periodEnd = resolvePeriodEnd(subscription?.currentPeriodEnd, periodStart);

  await repos.billing.consume({ periodStart, periodEnd, metric, quantity });
  return { allowed: true, check };
}

/** Gives back consumption for an action that failed (§8.9, §9.2). */
export async function releaseMetric(
  agencyId: string,
  metric: UsageMetric,
  quantity = 1,
): Promise<void> {
  if (!isConsumedMetric(metric)) return;
  const repos = repositoriesFor(agencyId);
  const subscription = await repos.billing.subscription();
  const periodStart = resolvePeriodStart(subscription?.currentPeriodStart);
  await repos.billing.release({ periodStart, metric, quantity });
}

/** Every meter for the billing page (§9.2, task 6.3). */
export async function getUsageSummary(agencyId: string): Promise<UsageSummary[]> {
  const repos = repositoriesFor(agencyId);
  const [entitlements, subscription, counts] = await Promise.all([
    getEntitlements(agencyId),
    repos.billing.subscription(),
    repos.billing.liveCounts(),
  ]);

  const periodStart = resolvePeriodStart(subscription?.currentPeriodStart);
  const periodEnd = resolvePeriodEnd(subscription?.currentPeriodEnd, periodStart);
  const records = await repos.billing.usageInPeriod(periodStart);
  const consumed = new Map(records.map((r) => [r.metric as string, r.quantity]));

  const metrics: UsageMetric[] = [
    "WEBSITES",
    "SEATS",
    "SCANS",
    "AI_CREDITS",
    "REPORTS",
    "STORAGE_BYTES",
  ];

  return metrics.map((metric) => {
    const used = isConsumedMetric(metric)
      ? (consumed.get(metric) ?? 0)
      : metric === "WEBSITES"
        ? counts.websites
        : metric === "SEATS"
          ? counts.seats
          : 0;

    const key = METRIC_LIMIT_KEY[metric];
    const check =
      key === null
        ? { allowed: true, limit: null, used, remaining: null, nearingLimit: false }
        : checkLimit(used, entitlements[key] as number, 0);

    return {
      metric,
      used,
      limit: check.limit,
      remaining: check.remaining,
      nearingLimit: check.nearingLimit,
      periodStart,
      periodEnd,
    };
  });
}

/**
 * The gate `POST /api/websites` and the Add Website action call before creating.
 *
 * Kept at this signature because Phase 1's call sites already use it — filling
 * in the rule was supposed to be a one-function change, and it was.
 */
export async function canAddWebsite(
  agencyId: string,
  /*
   * ⚠️ IGNORED, DELIBERATELY, AND KEPT FOR THE CALL SITES. The caller used to
   * pass a count it had already fetched. The live `COUNT(*)` inside
   * `checkMetricLimit` is authoritative — a caller-supplied number is a second
   * source of truth that can disagree, and the one that decides whether someone
   * can add a website should not be the one the UI happened to render.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentCount?: number,
): Promise<{ allowed: true } | { allowed: false; limit: number }> {
  const check = await checkMetricLimit(agencyId, "WEBSITES");
  if (check.allowed) return { allowed: true };
  return { allowed: false, limit: check.limit ?? 0 };
}

export type { EntitlementSet, LimitCheck, UsageSummary };
