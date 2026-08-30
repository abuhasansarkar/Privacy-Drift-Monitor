import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  createScanQueue,
  enqueueScan,
  type ScanJobData,
} from "@pdm/scanner/queue/queues";
import { childLogger, logger } from "@pdm/shared/logger";
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
      enqueued += 1;
    } catch (error) {
      // One bad site must not stop the sweep — the rest are still due.
      log.error({ err: error }, "failed to enqueue scheduled scan");
    }
  }

  await queue.close();
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

/** Runs both sweeps on an interval. Started by the worker process. */
export function startScheduler(connection: IORedis, intervalMs = 60_000) {
  let running = false;

  const tick = async () => {
    // A sweep that overruns its interval must not overlap itself: two
    // concurrent sweeps would both see the same due sites.
    if (running) return;
    running = true;
    try {
      await recoverStuckScans();
      const enqueued = await sweepDueWebsites(connection);
      if (enqueued > 0) logger.info({ enqueued }, "scheduled scans enqueued");
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
