import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  createRedisConnection,
  createScanQueue,
  enqueueScan,
  type ScanJobData,
} from "@pdm/scanner/queue/queues";
import { childLogger } from "@pdm/shared/logger";
import { releaseMetric } from "@/server/entitlements";
import { requireAndConsume } from "@/server/services/entitlement-guard";
import { ConflictError } from "@pdm/shared/errors";
import { t } from "@pdm/shared/copy";

/**
 * SCAN ENQUEUE — PLAN.md Part VII §7.3/§7.4, Phase 2 task 2.13.
 *
 * The web app's half of the queue: it creates the scan row and publishes the
 * job. The worker owns everything after that.
 *
 * ⚠️ THE ROW IS CREATED BEFORE THE JOB IS PUBLISHED, and never the other way
 * round. A job referencing a scan id that does not exist yet is a worker crash
 * on a race the user cannot see; a scan row with no job is a QUEUED row the
 * stuck-scan sweep reclaims. One failure mode is recoverable, the other is not.
 *
 * ⚠️ THE JOB IS PUBLISHED OUTSIDE ANY TRANSACTION (§5.6): "if the transaction
 * rolls back, the job still exists and will operate on data that was never
 * committed".
 */

const SCANNER_VERSION = process.env.SCANNER_VERSION ?? "1.0.0";

/**
 * One connection per process, created lazily.
 *
 * Next dev reloads modules on every edit; a connection created at module scope
 * would open a new Redis client per reload and exhaust the server's connection
 * limit within an afternoon. Same reason `client.ts` caches Prisma on
 * globalThis.
 */
const globalForQueue = globalThis as unknown as {
  pdmScanQueue?: ReturnType<typeof createScanQueue>;
};

function scanQueue() {
  if (!globalForQueue.pdmScanQueue) {
    const connection = createRedisConnection(
      process.env.REDIS_URL ?? "redis://localhost:6379",
    );
    globalForQueue.pdmScanQueue = createScanQueue(connection);
  }
  return globalForQueue.pdmScanQueue;
}

export interface TriggerScanInput {
  agencyId: string;
  websiteId: string;
  userId?: string | null;
  trigger: ScanJobData["trigger"];
}

export async function triggerScan(input: TriggerScanInput): Promise<{ scanId: string }> {
  const log = childLogger({ agencyId: input.agencyId, websiteId: input.websiteId });
  const repos = repositoriesFor(input.agencyId);

  const website = await repos.websites.findById(input.websiteId);
  if (!website) {
    throw new ConflictError(t("error.notFound"), {
      reason: `WEBSITE_MISSING:${input.websiteId}`,
    });
  }

  /*
   * ⚠️ ONE RUNNING SCAN PER WEBSITE (§7.4). A second concurrent scan of the
   * same site costs a browser slot and races the first to write the same
   * counters — and the two recordings would differ for reasons that have
   * nothing to do with the site.
   */
  const inFlight = await repos.db.scan.findFirst({
    where: { websiteId: input.websiteId, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (inFlight) {
    throw new ConflictError(t("scans.alreadyRunning"), {
      reason: `SCAN_IN_PROGRESS:${inFlight.id}`,
    });
  }

  /*
   * ⚠️ ENFORCEMENT POINT (§9.2): "Manual scan → consume(SCANS, 1) → 402".
   *
   * ⚠️ AFTER the in-flight check and BEFORE the row is written. Order matters
   * in both directions:
   *
   *   - After in-flight, because a duplicate click that is going to be rejected
   *     as already-running must not burn a scan from the customer's allowance.
   *   - Before `enqueue`, because a scan row created and then refused leaves a
   *     QUEUED scan nothing will ever consume, which the stuck-scan recovery
   *     sweep then has to reap.
   *
   * ⚠️ A `VERIFICATION` SCAN IS EXEMPT. §6.5 re-scans automatically when a user
   * marks an issue RESOLVED — that scan is OUR verification of THEIR claim, not
   * work they asked for, and charging for it would mean an agency at its limit
   * can never prove a fix. `emitScanAlerts` and the issue action both depend on
   * that re-scan running.
   */
  if (input.trigger !== "VERIFICATION") {
    await requireAndConsume(input.agencyId, "SCANS", 1);
  }

  let scan;
  try {
    scan = await repos.scans.enqueue({
      websiteId: input.websiteId,
      trigger: input.trigger,
      triggeredById: input.userId ?? null,
      scannerVersion: SCANNER_VERSION,
    });
  } catch (error) {
    // ⚠️ Give the credit back. The customer asked for a scan they did not get.
    if (input.trigger !== "VERIFICATION") {
      await releaseMetric(input.agencyId, "SCANS", 1).catch(() => {});
    }
    throw error;
  }

  /*
   * ⚠️ NOT WRAPPED IN THE SAME REFUND. If the row is written and the ENQUEUE
   * fails, the scan exists and the stuck-scan recovery sweep (§7.4) will either
   * run it or fail it — so the customer may still get what they paid for.
   * Refunding here would hand back a credit for work that then happens.
   */
  await enqueueScan(scanQueue(), {
    scanId: scan.id,
    websiteId: website.id,
    agencyId: input.agencyId,
    url: website.url,
    registrableDomain: website.registrableDomain,
    monitoredPaths: website.monitoredPaths,
    respectRobots: website.respectRobots ?? true,
    blockMedia: process.env.SCAN_BLOCK_MEDIA !== "false",
    trigger: input.trigger,
  });

  log.info({ scanId: scan.id, trigger: input.trigger }, "scan enqueued");
  return { scanId: scan.id };
}
