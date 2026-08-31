import type { Queue } from "bullmq";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  enqueueNotification,
  type NotificationJobData,
} from "@pdm/scanner/queue/queues";
import {
  FALLBACK_ENTITLEMENTS,
  checkLimit,
  resolveEntitlements,
  resolvePeriodEnd,
  resolvePeriodStart,
  type SubscriptionStatusName,
} from "@pdm/billing";

/**
 * SCAN QUOTA FOR THE SCHEDULER — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * §9.2's enforcement table gives the scheduled scan a DIFFERENT failure mode
 * from the manual one, and the difference is the whole reason this file exists:
 *
 *   Manual scan     → `consume(SCANS, 1)` → **402**
 *   Scheduled scan  → `consume(SCANS, 1)` → **scan skipped, site flagged
 *                      `quota_exceeded`, one notification per period**
 *
 * ⚠️ THE SCHEDULER MUST NOT THROW. A 402 is the right answer to a person who
 * clicked a button; there is nobody to show it to at 3am, and an exception in
 * the sweep would abort the batch and starve every OTHER agency's due websites
 * behind one agency's exhausted quota. So this returns a decision and the sweep
 * skips that site and continues.
 *
 * ⚠️ ONE NOTIFICATION PER PERIOD, NOT PER SWEEP. The scheduler runs every
 * minute. A site that is over quota is over quota for the rest of the billing
 * period, so a naive alert would send hundreds of identical emails — which is
 * how an agency learns to filter our mail to a folder, and then misses a
 * CRITICAL finding. The dedupe key below is per (agency, period), so the whole
 * portfolio produces exactly one.
 *
 * ⚠️ `server-only` CODE IS UNREACHABLE FROM `worker/`, so this resolves the
 * plan through `@pdm/billing`'s pure functions — the same ones
 * `src/server/entitlements.ts` uses. Both processes reach the same answer
 * through the same code, which is what stops the scheduler and the UI
 * disagreeing about whether a site may scan.
 */

export interface ScanQuotaDecision {
  allowed: boolean;
  used: number;
  limit: number | null;
  periodStart: Date;
  periodEnd: Date;
  /** Stable per (agency, period) — the alert dedupe key. */
  dedupeKey: string;
}

/**
 * May this agency start one more scheduled scan?
 *
 * ⚠️ CHECK ONLY — it does not consume. The sweep consumes separately, AFTER the
 * scan row is created, so a site skipped for an unrelated reason (already
 * in flight, MANUAL frequency) does not burn a scan from the allowance. The
 * cost of the split is a small race the manual path also accepts, bounded by
 * `maxConcurrentScans`.
 */
export async function checkScanQuota(agencyId: string): Promise<ScanQuotaDecision> {
  const repos = repositoriesFor(agencyId);
  const subscription = await repos.billing.subscription();

  const entitlements = subscription
    ? resolveEntitlements({
        planEntitlements: subscription.plan.entitlements,
        overrides: subscription.entitlementOverrides,
        status: subscription.status as SubscriptionStatusName,
        trialEndsAt: subscription.trialEndsAt,
      })
    : FALLBACK_ENTITLEMENTS;

  const periodStart = resolvePeriodStart(subscription?.currentPeriodStart);
  const periodEnd = resolvePeriodEnd(subscription?.currentPeriodEnd, periodStart);
  const used = await repos.billing.usageFor(periodStart, "SCANS");
  const check = checkLimit(used, entitlements.maxScansPerMonth);

  return {
    allowed: check.allowed,
    used: check.used,
    limit: check.limit,
    periodStart,
    periodEnd,
    // ⚠️ Colons are fine in a DATABASE key — only the BullMQ job id rewrites
    // them (`toJobId`). This one is a notification dedupe key.
    dedupeKey: `${agencyId}:QUOTA_EXCEEDED:SCANS:${periodStart.toISOString().slice(0, 10)}`,
  };
}

/** Records the consumption after a scheduled scan has actually been created. */
export async function consumeScheduledScan(
  agencyId: string,
  decision: ScanQuotaDecision,
): Promise<void> {
  const repos = repositoriesFor(agencyId);
  await repos.billing.consume({
    periodStart: decision.periodStart,
    periodEnd: decision.periodEnd,
    metric: "SCANS",
    quantity: 1,
  });
}

/**
 * Tells the agency once that its scan quota is exhausted.
 *
 * ⚠️ ONCE PER PERIOD, VIA THE BULLMQ JOB ID. The scheduler sweeps every minute
 * and an exhausted quota stays exhausted for the rest of the period — a naive
 * alert would send one per due site per minute, which is thousands of identical
 * emails. BullMQ ignores an `add()` for a job id it already holds, and
 * `dedupeKey` is stable per (agency, period), so the whole portfolio produces
 * exactly one for the whole period. This is the same mechanism §6.6 uses for
 * alert dedupe, reused rather than reinvented.
 *
 * ⚠️ NEVER FAILS THE SWEEP. A notification is a courtesy; the sweep's job is to
 * keep scanning every other agency. A queue hiccup here must not abort a batch.
 */
export async function notifyQuotaExceeded(
  agencyId: string,
  decision: ScanQuotaDecision,
  queue: Queue<NotificationJobData>,
): Promise<void> {
  try {
    await enqueueNotification(queue, {
      agencyId,
      type: "USAGE_LIMIT_WARNING",
      severity: "HIGH",
      title: "Scheduled scans are paused",
      body:
        `Your plan includes ${decision.limit} scans this period and ${decision.used} have been used. ` +
        `Monitoring resumes automatically when the period resets on ` +
        `${decision.periodEnd.toISOString().slice(0, 10)}, or as soon as you move up a plan. ` +
        `Nothing has been removed and every past scan is still available.`,
      linkUrl: "/app/billing",
      entityType: null,
      entityId: null,
      websiteId: null,
      websiteGroupId: null,
      clientId: null,
      websiteLabel: null,
      dedupeKey: decision.dedupeKey,
    });
  } catch {
    /* a lost notification must never cost another agency its scan */
  }
}
