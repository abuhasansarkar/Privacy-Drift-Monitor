import { repositoriesFor } from "@pdm/database/repositories";
import { BrowserPool } from "@pdm/scanner/browser/pool";
import {
  QUEUE_NAMES,
  createRedisConnection,
  type ScanJobData,
} from "@pdm/scanner/queue/queues";
// bullmq is reached through the scanner package on purpose — see queue/worker.ts.
import { createScanWorker, type Job } from "@pdm/scanner/queue/worker";
import { screenshotKey } from "@pdm/scanner/record/screenshots";
import { runScan } from "@pdm/scanner/scan";
import { objectStore } from "@pdm/storage";
import { isRetryable, type ScanResult } from "@pdm/scanner/types";
import { childLogger, logger } from "@pdm/shared/logger";
import { analyseScan } from "./analysis";
import { startScheduler } from "./scheduler";

/**
 * SCAN WORKER — PLAN.md Part VII §7.2, Phase 2 task 2.1.
 *
 * A separate Node process. It shares `packages/*` with the web app and owns
 * nothing the web app owns: the web app enqueues, the worker consumes.
 *
 * ⚠️ GRACEFUL SHUTDOWN IS NOT OPTIONAL HERE. A container is stopped on every
 * deploy, and a scan killed mid-flight leaves a Chromium process tree behind
 * and a scan row stuck in RUNNING forever. The SIGTERM path below stops taking
 * new jobs, lets in-flight scans finish, and closes the pool — in that order.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 2);
const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;
const SCANNER_VERSION = process.env.SCANNER_VERSION ?? "1.0.0";

const pool = new BrowserPool({
  concurrency: CONCURRENCY,
  maxUses: Number(process.env.SCAN_BROWSER_MAX_USES ?? 50),
  maxAgeMs: Number(process.env.SCAN_BROWSER_MAX_AGE_MS ?? 30 * 60 * 1000),
  userAgentSuffix: process.env.SCAN_USER_AGENT_SUFFIX,
});

const connection = createRedisConnection(REDIS_URL);

async function processScan(job: Job<ScanJobData>): Promise<ScanSummary> {
  const log = childLogger({
    jobId: job.id,
    scanId: job.data.scanId,
    agencyId: job.data.agencyId,
    websiteId: job.data.websiteId,
  });

  log.info({ attempt: job.attemptsMade + 1 }, "scan started");

  // Tenant-scoped from the job's agencyId. The worker never touches the raw
  // client — a cross-tenant write here would be invisible until a customer
  // found their data in someone else's report.
  const repos = repositoriesFor(job.data.agencyId);
  await repos.scans.markRunning(job.data.scanId, WORKER_ID);

  const result = await runScan(
    {
      scanId: job.data.scanId,
      websiteId: job.data.websiteId,
      agencyId: job.data.agencyId,
      url: job.data.url,
      registrableDomain: job.data.registrableDomain,
      monitoredPaths: job.data.monitoredPaths,
      respectRobots: job.data.respectRobots,
      blockMedia: job.data.blockMedia,
    },
    { pool, scannerVersion: SCANNER_VERSION, workerId: WORKER_ID },
  );

  /*
   * ⚠️ RETRY IS DECIDED HERE, NOT BY BULLMQ ALONE. §4.4 splits scan errors into
   * transient and deterministic. Letting BullMQ retry everything would spend
   * three browser slots re-proving that a domain does not resolve, while the
   * queue backs up behind it. A deterministic failure is a RESULT — it is
   * returned, and the scan is recorded as FAILED once.
   */
  if (result.status === "FAILED" && result.errorCode) {
    if (isRetryable(result.errorCode)) {
      log.warn({ errorCode: result.errorCode }, "scan failed, retrying");
      // The row stays RUNNING for the retry. `recoverStuckScans` is what
      // reclaims it if every attempt dies (§7.4).
      throw new Error(`retryable scan failure: ${result.errorCode}`);
    }
    log.warn({ errorCode: result.errorCode }, "scan failed permanently");
  }

  // PARTIAL is a SUCCESS for the queue: the phases that ran produced evidence
  // worth keeping, and retrying would not make an absent reject button appear
  // (P5/P6).
  log.info(
    {
      status: result.status,
      durationMs: result.durationMs,
      phases: result.phases.map((phase) => `${phase.phase}:${phase.status}`),
    },
    "scan finished",
  );

  const screenshotKeys = await uploadScreenshots(job.data, result);
  await persist(repos, result, screenshotKeys);

  /*
   * ⚠️ ANALYSIS RUNS AFTER THE EVIDENCE IS COMMITTED, AND ITS FAILURE DOES NOT
   * FAIL THE SCAN (§3.8). The recording is the expensive, unrepeatable part; a
   * rule that throws must not throw it away. A scan whose analysis failed shows
   * its evidence with no issues yet, and analysis can be re-run over the stored
   * rows — which is the whole reason the two are separate steps.
   */
  if (result.status !== "FAILED") {
    try {
      await analyseScan(job.data.agencyId, result.scanId);
    } catch (error) {
      log.error({ err: error }, "analysis failed; evidence is kept");
    }
  }

  // The job's return value is a SUMMARY, not the evidence. BullMQ stores the
  // return value in Redis, and a scan's full recording is megabytes — the
  // database is where it belongs, and it is already there by this point.
  return {
    scanId: result.scanId,
    status: result.status,
    durationMs: result.durationMs,
    requestCount: result.phases.reduce((n, phase) => n + phase.requests.length, 0),
  };
}

interface ScanSummary {
  scanId: string;
  status: ScanResult["status"];
  durationMs: number;
  requestCount: number;
}

/**
 * Maps a `ScanResult` onto rows.
 *
 * The scanner package deliberately knows nothing about Prisma, so this flatten
 * is the seam between the two. Phase-scoped arrays are concatenated because the
 * evidence tables carry `consentPhase` on every row — the phase is data, not
 * table structure, which is what lets drift compare across phases with one query.
 */
/**
 * Uploads screenshots and returns their keys.
 *
 * ⚠️ UPLOADED BEFORE THE TRANSACTION, NOT INSIDE IT. An S3 round-trip inside a
 * database transaction holds row locks for the length of a network call to
 * another service — and if S3 is slow, every scan finishing at that moment
 * waits behind it. An orphaned object after a failed transaction is cheap and
 * the retention sweep collects it; a held lock is an outage.
 *
 * ⚠️ A FAILED UPLOAD IS NOT A FAILED SCAN. Screenshots corroborate; they never
 * establish a fact (P1). Losing one costs a picture, and discarding a good
 * recording over it would cost the evidence.
 */
async function uploadScreenshots(
  job: ScanJobData,
  result: ScanResult,
): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const store = objectStore();

  for (const phase of result.phases) {
    for (const shot of phase.screenshots) {
      const key = screenshotKey({
        agencyId: job.agencyId,
        websiteId: job.websiteId,
        scanId: result.scanId,
        phase: shot.consentPhase,
        kind: shot.kind,
      });
      try {
        await store.put(key, shot.body, "image/png");
        keys.set(`${shot.consentPhase}:${shot.kind}`, key);
      } catch (error) {
        childLogger({ scanId: result.scanId }).warn(
          { err: error, key },
          "screenshot upload failed; scan continues",
        );
      }
    }
  }

  return keys;
}

async function persist(
  repos: ReturnType<typeof repositoriesFor>,
  result: ScanResult,
  screenshotKeys: Map<string, string>,
): Promise<void> {
  await repos.scans.complete(
    result.scanId,
    {
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      scannerVersion: result.scannerVersion,
      browserVersion: result.browserVersion,
      workerId: result.workerId,
      userAgent: result.userAgent,
      cmp: result.cmp
        ? {
            cmpId: result.cmp.cmpId,
            cmpName: result.cmp.cmpName,
            version: result.cmp.version,
            confidence: result.cmp.confidence,
          }
        : null,
      pagesScanned: result.pagesScanned,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      errorPhase: result.errorPhase,
    },
    {
      phases: result.phases.map((phase) => ({
        phase: phase.phase,
        status: phase.status,
        startedAt: phase.startedAt,
        finishedAt: phase.finishedAt,
        durationMs: phase.durationMs,
        actionMethod: phase.actionMethod,
        actionConfidence: phase.actionConfidence,
        selectorUsed: phase.selectorUsed,
        elementText: phase.elementText,
        inIframe: phase.inIframe,
        bannerDismissed: phase.bannerDismissed,
        errorCode: phase.errorCode,
        errorMessage: phase.errorMessage,
      })),
      requests: result.phases.flatMap((phase) => phase.requests),
      cookies: result.phases.flatMap((phase) => phase.cookies),
      storage: result.phases.flatMap((phase) => phase.storage),
      consoleLogs: result.phases.flatMap((phase) =>
        // ConsoleLog has no consentPhase column — it is diagnostic, not
        // evidence, and never supports a finding on its own.
        phase.consoleLogs.map((entry) => ({ ...entry })),
      ),
      // Only the KEY is stored. The bytes live in object storage and are
      // served through a short-lived signed URL, never a column and never a
      // persisted public link.
      screenshots: result.phases.flatMap((phase) =>
        phase.screenshots.flatMap((shot) => {
          const key = screenshotKeys.get(`${shot.consentPhase}:${shot.kind}`);
          return key
            ? [
                {
                  consentPhase: shot.consentPhase,
                  kind: shot.kind,
                  s3Key: key,
                  width: shot.width,
                  height: shot.height,
                  sizeBytes: shot.body.byteLength,
                },
              ]
            : [];
        }),
      ),
    },
  );
}

const worker = createScanWorker<ScanSummary>(processScan, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on("failed", (job, error) => {
  childLogger({ jobId: job?.id, scanId: job?.data.scanId }).error(
    { err: error },
    "scan job failed",
  );
});

// The scheduler runs IN the worker process rather than as its own service:
// it is a database sweep on a timer, and a second deployable would need its own
// leader election to avoid double-sweeping (§7.5). Set WORKER_ROLES without
// `scheduler` on the replicas that should not sweep.
const stopScheduler = (process.env.WORKER_ROLES ?? "scan,scheduler").includes(
  "scheduler",
)
  ? startScheduler(connection, Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000))
  : null;

logger.info(
  {
    workerId: WORKER_ID,
    concurrency: CONCURRENCY,
    queue: QUEUE_NAMES.scan,
    scheduler: stopScheduler !== null,
  },
  "scan worker ready",
);

/**
 * Shutdown order matters and is the whole point of this block:
 *   1. `worker.close()` stops taking NEW jobs and waits for in-flight ones.
 *   2. `pool.close()` then closes Chromium — after, so no scan loses its browser.
 *   3. Redis last, because steps 1 and 2 still report through it.
 */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "worker shutting down");

  try {
    stopScheduler?.();
    await worker.close();
    await pool.close(30_000);
    await connection.quit();
    logger.info("worker stopped cleanly");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "unclean shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
