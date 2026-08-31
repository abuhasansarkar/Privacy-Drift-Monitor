import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  createNotificationQueue,
  createScanQueue,
  enqueueScan,
  type ScanJobData,
} from "@pdm/scanner/queue/queues";
import { childLogger, logger } from "@pdm/shared/logger";
import {
  checkScanQuota,
  consumeScheduledScan,
  notifyQuotaExceeded,
} from "./jobs/scan-quota";
import { reconcileCounters } from "./jobs/reconcile-counters";
import type IORedis from "ioredis";

/**
 * SCHEDULER — PLAN.md Part VII §7.5, Phase 2 task 2.13.
 *
 * ⚠️ DATABASE-DRIVEN, NOT CRON-DRIVEN. `Website.nextScanAt` is the single
 * source of truth for scheduling (§7.5). A cron expression per site would be a
 * second source that can disagree with the row — and pausing a site would then
 * mean remembering to cancel a schedule somewhere else, which is how a paused
 * site keeps getting scanned.
 *
 * The sweep is idempotent: it only picks up sites whose `nextScanAt` is due,
 * and enqueueing sets a new one. Two schedulers running at once would each see
 * the same due sites, but `triggerScan`'s in-flight check and BullMQ's job-id
 * de-duplication mean the second finds nothing to do.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): the scheduler is cross-tenant by
  // definition — it sweeps every agency's due websites. Per-site work is then
  // handed to a tenant-scoped repository.
  "scheduler sweeps due websites across every agency",
);

const SCANNER_VERSION = process.env.SCANNER_VERSION ?? "1.0.0";

/** How long a RUNNING scan may go without finishing before it is reclaimed. */
const STUCK_AFTER_MS = Number(process.env.SCAN_STUCK_AFTER_MS ?? 30 * 60 * 1000);

/** Cap per sweep, so one enormous agency cannot monopolise the queue. */
const BATCH = Number(process.env.SCHEDULER_BATCH ?? 100);

const FREQUENCY_MS: Record<string, number> = {
  DAILY: 24 * 3600 * 1000,
  WEEKLY: 7 * 24 * 3600 * 1000,
  MONTHLY: 30 * 24 * 3600 * 1000,
};

/**
 * Enqueues every website whose next check is due.
 *
 * ⚠️ `nextScanAt` is advanced BEFORE the job is published, not after. If the
 * publish fails, the site is scanned one cycle late — annoying. If the order
 * were reversed and the update failed, the site would be re-enqueued on every
 * sweep, which is a queue flood that also costs a browser slot each time.
 */
export async function sweepDueWebsites(connection: IORedis): Promise<number> {
  const queue = createScanQueue(connection);
  // The quota notice rides the notification queue the alert pipeline already
  // owns (§6.6), so it inherits dedupe, quiet hours and channel routing.
  const notificationQueue = createNotificationQueue(connection);
  const now = new Date();

  const due = await db.website.findMany({
    where: {
      monitoringStatus: "ACTIVE",
      archivedAt: null,
      nextScanAt: { lte: now },
      agency: { status: "ACTIVE" },
    },
    orderBy: [{ scanPriority: "desc" }, { nextScanAt: "asc" }],
    take: BATCH,
  });

  let enqueued = 0;

  for (const website of due) {
    const log = childLogger({ agencyId: website.agencyId, websiteId: website.id });

    try {
      const repos = repositoriesFor(website.agencyId);

      // Same one-scan-per-website rule the manual path enforces (§7.4). A site
      // whose previous scan is still running is skipped, not queued behind it.
      const inFlight = await repos.db.scan.findFirst({
        where: { websiteId: website.id, status: { in: ["QUEUED", "RUNNING"] } },
        select: { id: true },
      });
      if (inFlight) {
        log.debug({ scanId: inFlight.id }, "skipping: scan already in flight");
        continue;
      }

      /*
       * ⚠️ ENFORCEMENT POINT (§9.2): "Scheduled scan → consume(SCANS, 1) →
       * scan skipped, site flagged `quota_exceeded`, one notification per
       * period".
       *
       * ⚠️ CHECKED BEFORE `nextScanAt` IS ADVANCED, DELIBERATELY. Skipping
       * WITHOUT advancing means the site stays due and is re-checked on the
       * next sweep — so the moment the period rolls over, or the agency
       * upgrades, monitoring resumes on its own with no intervention. Advancing
       * first would silently push the site a whole cycle into the future as a
       * side effect of a billing state, and an agency that upgraded at 09:00
       * would wait until next week for a scan they have already paid for.
       *
       * ⚠️ IT DOES NOT THROW. There is nobody to show a 402 to at 3am, and an
       * exception here would abort the batch — starving every other agency's
       * due websites behind one agency's exhausted quota.
       */
      const quota = await checkScanQuota(website.agencyId);
      if (!quota.allowed) {
        log.info(
          { used: quota.used, limit: quota.limit },
          "skipping: scan quota exhausted for this period",
        );
        await notifyQuotaExceeded(website.agencyId, quota, notificationQueue);
        continue;
      }

      const interval = FREQUENCY_MS[website.scanFrequency];
      await db.website.update({
        where: { id: website.id },
        data: {
          // MANUAL has no interval — such a site should never have been due,
          // and nulling it here stops it being picked up every sweep forever.
          nextScanAt: interval ? new Date(now.getTime() + interval) : null,
        },
      });

      const scan = await repos.scans.enqueue({
        websiteId: website.id,
        trigger: "SCHEDULED",
        scannerVersion: SCANNER_VERSION,
      });

      const job: ScanJobData = {
        scanId: scan.id,
        websiteId: website.id,
        agencyId: website.agencyId,
        url: website.url,
        registrableDomain: website.registrableDomain,
        monitoredPaths: website.monitoredPaths,
        respectRobots: website.respectRobots ?? true,
        blockMedia: process.env.SCAN_BLOCK_MEDIA !== "false",
        trigger: "SCHEDULED",
      };
      await enqueueScan(queue, job);

      /*
       * ⚠️ CONSUMED AFTER THE SCAN EXISTS, not at the check above. A site
       * skipped for any other reason — already in flight, MANUAL frequency, a
       * failed enqueue — must not burn a scan from the allowance the customer
       * bought.
       */
      await consumeScheduledScan(website.agencyId, quota);
      enqueued += 1;
    } catch (error) {
      // One bad site must not stop the sweep — the rest are still due.
      log.error({ err: error }, "failed to enqueue scheduled scan");
    }
  }

  await Promise.all([queue.close(), notificationQueue.close()]);
  return enqueued;
}

/**
 * Reclaims scans stuck in RUNNING (§7.4).
 *
 * ⚠️ THIS IS WHY THE STATE MACHINE MATTERS. A worker killed mid-scan leaves a
 * row saying RUNNING forever, and the in-flight check above then refuses to
 * schedule that website EVER AGAIN. The site silently stops being monitored,
 * and nothing in the UI says so — the worst failure this system can have,
 * because it looks exactly like everything working.
 */
export async function recoverStuckScans(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  const { count } = await db.scan.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorCode: "SCAN_TIMEOUT",
      errorMessage: "Scan did not report back and was reclaimed",
    },
  });

  if (count > 0) logger.warn({ count }, "reclaimed stuck scans");
  return count;
}

/**
 * §9.2's counter reconciliation runs on its own, much slower, cadence.
 *
 * ⚠️ NOT ON THE MINUTE TICK. It sweeps EVERY website on the platform with three
 * counts each; at the scheduler's interval that is a continuous full-table scan
 * competing with the queries that actually dispatch scans. Nightly is what §9.2
 * and §12.3's "catches divergence within 24 h" ask for, and drift that has sat
 * for an hour is no worse than drift that has sat for a minute — it is a bug
 * report either way, not an outage.
 */
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Runs the sweeps on an interval. Started by the worker process. */
export function startScheduler(connection: IORedis, intervalMs = 60_000) {
  let running = false;
  let lastReconcileAt = 0;

  const tick = async () => {
    // A sweep that overruns its interval must not overlap itself: two
    // concurrent sweeps would both see the same due sites.
    if (running) return;
    running = true;
    try {
      await recoverStuckScans();
      const enqueued = await sweepDueWebsites(connection);
      if (enqueued > 0) logger.info({ enqueued }, "scheduled scans enqueued");

      /*
       * ⚠️ AFTER the scan sweep and inside the same `running` guard, so it can
       * never run twice concurrently and never delays a due scan by more than
       * its own duration. A failure here is caught by the outer handler and the
       * next tick simply tries again — reconciliation is idempotent by
       * construction (it compares and repairs; running it twice is a no-op the
       * second time).
       */
      if (Date.now() - lastReconcileAt >= RECONCILE_INTERVAL_MS) {
        lastReconcileAt = Date.now();
        await reconcileCounters();
      }
    } catch (error) {
      logger.error({ err: error }, "scheduler tick failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  // Do not hold the process open on this timer alone — shutdown owns the exit.
  timer.unref();
  void tick();

  return () => clearInterval(timer);
}
