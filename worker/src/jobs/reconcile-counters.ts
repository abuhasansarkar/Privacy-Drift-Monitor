import { unsafeGlobalClient } from "@pdm/database";
import { logger } from "@pdm/shared/logger";

/**
 * COUNTER RECONCILIATION — PLAN.md Part IX §9.2, §5.4, Phase 6 task 6.2/6.9.
 *
 * §9.2 asks for a "counter reconciliation job (denormalized counters drift
 * under concurrency)", and feature doc 17 adds the sharpest instruction in the
 * whole phase: **"alert if it ever finds non-zero drift."**
 *
 * ⚠️ THAT INSTRUCTION IS WHY THIS JOB REPORTS RATHER THAN JUST FIXING. A job
 * that silently corrects is a job that hides a bug: the counters are maintained
 * inside the same transaction as the change (§5.4), so a discrepancy means that
 * invariant is broken somewhere, and quietly patching the symptom every night
 * guarantees nobody ever finds the cause. So it repairs AND records what it
 * repaired, loudly.
 *
 * ⚠️ WHAT IT DOES **NOT** TOUCH: `UsageRecord`. Those are the BILLING ledger,
 * and they are the reason `consume()` uses an atomic `increment` under a unique
 * constraint rather than a read-then-write — they cannot drift from concurrency
 * by construction. "Reconciling" them would mean deciding, after the fact, that
 * a customer used a different number of scans than the ledger recorded, with no
 * evidence for the new number. Divergence between OUR ledger and STRIPE is a
 * different job (§9.1's daily Stripe reconciliation), and it is not this one.
 *
 * The denormalized counters this DOES own are the display counters on
 * `Website`, which §5.4 maintains transactionally and which nothing bills on.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): reconciliation is a PLATFORM sweep over
  // every tenant by definition — a tenant-scoped client could only ever check
  // the agency it was given, which is not what "find drift anywhere" means.
  // It only ever compares and repairs a website's own counters against its own
  // rows; no data crosses an agency boundary.
  "counter reconciliation sweeps every agency by definition",
);

export interface CounterDrift {
  websiteId: string;
  agencyId: string;
  field: "openIssueCount" | "criticalIssueCount" | "trackerCount";
  stored: number;
  actual: number;
}

export interface ReconcileResult {
  websitesChecked: number;
  drifts: CounterDrift[];
  repaired: number;
}

/** Statuses that mean an issue is still open — the same set §6.5 uses. */
const OPEN_STATUSES = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED", "UNVERIFIED"];

/**
 * Compares every website's denormalized counters against the truth and repairs
 * any that disagree.
 *
 * ⚠️ BATCHED, AND ORDERED BY ID. This runs over every website in the platform;
 * loading them all is a memory profile that grows with the customer base, and
 * an unordered scan can miss or repeat rows as the table changes underneath it.
 */
export async function reconcileCounters(
  options: { batchSize?: number; dryRun?: boolean } = {},
): Promise<ReconcileResult> {
  const batchSize = options.batchSize ?? 500;
  const result: ReconcileResult = { websitesChecked: 0, drifts: [], repaired: 0 };

  let cursor: string | undefined;

  for (;;) {
    const websites = await db.website.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        agencyId: true,
        openIssueCount: true,
        criticalIssueCount: true,
        trackerCount: true,
        lastScanId: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (websites.length === 0) break;
    cursor = websites[websites.length - 1]!.id;

    for (const website of websites) {
      result.websitesChecked += 1;

      const [openIssues, criticalIssues, trackers] = await Promise.all([
        db.issue.count({
          where: { websiteId: website.id, status: { in: OPEN_STATUSES as never } },
        }),
        db.issue.count({
          where: {
            websiteId: website.id,
            severity: "CRITICAL",
            status: { in: OPEN_STATUSES as never },
          },
        }),
        /*
         * ⚠️ TRACKERS ARE COUNTED ON THE LATEST SCAN, NOT ACROSS ALL OF THEM.
         * `trackerCount` means "how many trackers does this site have NOW", and
         * a lifetime count would only ever grow — a site that removed every
         * tracker would still read 14, and the number would be wrong in the
         * most reputationally expensive direction.
         */
        website.lastScanId
          ? db.trackerDetection
              .findMany({
                where: { scanId: website.lastScanId, vendorId: { not: null } },
                select: { vendorId: true },
                distinct: ["vendorId"],
              })
              .then((rows) => rows.length)
          : Promise.resolve(0),
      ]);

      const checks: Array<[CounterDrift["field"], number, number]> = [
        ["openIssueCount", website.openIssueCount, openIssues],
        ["criticalIssueCount", website.criticalIssueCount, criticalIssues],
        ["trackerCount", website.trackerCount, trackers],
      ];

      const wrong = checks.filter(([, stored, actual]) => stored !== actual);
      if (wrong.length === 0) continue;

      for (const [field, stored, actual] of wrong) {
        result.drifts.push({
          websiteId: website.id,
          agencyId: website.agencyId,
          field,
          stored,
          actual,
        });
      }

      if (!options.dryRun) {
        await db.website.update({
          where: { id: website.id },
          data: Object.fromEntries(wrong.map(([field, , actual]) => [field, actual])),
        });
        result.repaired += 1;
      }
    }

    if (websites.length < batchSize) break;
  }

  /*
   * ⚠️ `error`, NOT `info`. Feature doc 17: "alert if it ever finds non-zero
   * drift." §5.4 maintains these counters INSIDE the transaction that changes
   * them, so a discrepancy is not expected wear — it means that invariant is
   * broken somewhere, and the repair below has just hidden the evidence. The
   * log line is the only thing left pointing at the real bug.
   */
  if (result.drifts.length > 0) {
    logger.error(
      {
        component: "reconcile-counters",
        driftCount: result.drifts.length,
        websitesRepaired: result.repaired,
        sample: result.drifts.slice(0, 10),
      },
      "counter drift detected — §5.4's transactional invariant is broken somewhere",
    );
  } else {
    logger.info(
      { component: "reconcile-counters", websitesChecked: result.websitesChecked },
      "counters reconciled, no drift",
    );
  }

  return result;
}
