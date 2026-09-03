import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, quiet: true });
    break;
  }
}

import { repositoriesFor } from "@pdm/database/repositories";
import { BrowserPool } from "@pdm/scanner/browser/pool";
import {
  QUEUE_NAMES,
  createAiQueue,
  createEmailQueue,
  createNotificationQueue,
  createRedisConnection,
  type AiJobData,
  type DigestJobData,
  type EmailJobData,
  type FreeScanJobData,
  type NotificationJobData,
  type ReportJobData,
  type ScanJobData,
} from "@pdm/scanner/queue/queues";
// bullmq is reached through the scanner package on purpose — see queue/worker.ts.
import {
  createAiWorker,
  createDigestWorker,
  createEmailWorker,
  createNotificationWorker,
  createReportWorker,
  createFreeScanWorker,
  createScanWorker,
  type Job,
} from "@pdm/scanner/queue/worker";
import { closeReportBrowser } from "@pdm/reports";
import { screenshotKey } from "@pdm/scanner/record/screenshots";
import { runScan } from "@pdm/scanner/scan";
import { processFreeScan } from "./jobs/free-scan";
import { objectStore } from "@pdm/storage";
import { isRetryable, type ScanResult } from "@pdm/scanner/types";
import { childLogger, logger } from "@pdm/shared/logger";
import { analyseScan } from "./analysis";
import { emitScanAlerts } from "./jobs/alerts";
import { runDigest } from "./jobs/digest.job";
import { processEmailJob } from "./jobs/email.job";
import { dispatchNotification } from "./jobs/notification.job";
import { generateReport } from "./jobs/report.job";
import { closeAiRedis, processAiJob } from "./jobs/ai.job";
import { enqueueAutoExplain } from "./jobs/auto-explain";
import { startScheduler } from "./scheduler";
import { startDigestScheduler } from "./schedulers/digest-scheduler";

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

  /*
   * ⚠️ ALERTS ARE EMITTED AFTER ANALYSIS AND OUTSIDE ITS TRY/CATCH, and a
   * failure here never fails the scan either. The evidence and the findings are
   * already committed; a queue hiccup must not throw away a recording that
   * cannot be repeated. It also runs for a FAILED scan — "we could not reach
   * your site" is exactly the alert an agency needs (§6.6).
   */
  try {
    await emitScanAlerts(job.data.agencyId, result.scanId, notificationQueue);
  } catch (error) {
    log.error({ err: error }, "alert emission failed; findings are kept");
  }

  /*
   * ⚠️ AUTO-EXPLAIN IS LAST, AND ITS FAILURE IS THE LEAST CONSEQUENTIAL THING
   * IN THIS FUNCTION. It runs after alerts on purpose: an alert has a 60-second
   * budget (§12.3) and must not queue behind an optional explanation. It is
   * also wrapped separately, because P3 says findings render with or without AI
   * — a queue hiccup here must not lose a scan whose evidence cannot be
   * re-recorded. `enqueueAutoExplain` itself returns 0 unless three switches
   * are on, the outermost being the AI_AUTO_EXPLAIN kill switch.
   */
  try {
    await enqueueAutoExplain(job.data.agencyId, result.scanId, aiQueue);
  } catch (error) {
    log.warn({ err: error }, "auto-explain enqueue failed; findings are unaffected");
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
      // Resolved by the scanner while the scan ran, never recomputed here —
      // DNS moves, and a fact re-derived at write time is not the fact the
      // scan observed.
      cnameResolutions: result.cnameResolutions.map((entry) => ({
        host: entry.originalHost,
        chain: [...entry.chain],
        canonicalHost: entry.canonicalHost,
        isCloaked: entry.isCloaked,
      })),
    },
  );
}

/**
 * ⚠️ ROLES SELECT WHAT THIS REPLICA CONSUMES (§7.2, §7.7). Scanning and report
 * rendering both own a Chromium, and running them on the same box means a
 * report backlog competes for the memory a scan needs. The default runs
 * everything, which is right for local development and for a single-box
 * deployment; production splits `scan` from `report`.
 */
const ROLES = (process.env.WORKER_ROLES ??
  "scan,scheduler,notification,email,report,digest,ai,free-scan")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);

const hasRole = (role: string): boolean => ROLES.includes(role);

const notificationQueue = createNotificationQueue(connection);
const emailQueue = createEmailQueue(connection);
/* The analysis job publishes auto-explain work here (§8.5 feature 1). */
const aiQueue = createAiQueue(connection);

const workers: { name: string; close: () => Promise<void> }[] = [];

const scanWorker = hasRole("scan")
  ? createScanWorker<ScanSummary>(processScan, { connection, concurrency: CONCURRENCY })
  : null;

if (scanWorker) {
  scanWorker.on("failed", (job, error) => {
    childLogger({ jobId: job?.id, scanId: job?.data.scanId }).error(
      { err: error },
      "scan job failed",
    );
  });
  workers.push({ name: QUEUE_NAMES.scan, close: () => scanWorker.close() });
}

/*
 * ⚠️ THE FREE SCANNER GETS ITS OWN WORKER, ITS OWN QUEUE AND ITS OWN
 * CONCURRENCY CAP (§3.2: "cannot starve paying customers"). It shares the
 * BROWSER POOL with paid scans, which is deliberate — one pool means one place
 * that owns Chromium lifecycle and context cleanup — but the pool's capacity is
 * `SCAN_CONCURRENCY`, and this worker can never hold more than
 * `FREE_SCAN_CONCURRENCY` of it at once. Set the two so the free cap is a small
 * fraction of the pool, or a burst of anonymous submissions will make paid
 * scans queue behind them for a browser slot.
 */
if (hasRole("free-scan")) {
  const freeScanWorker = createFreeScanWorker(
    (job: Job<FreeScanJobData>) =>
      processFreeScan(job, { pool, scannerVersion: SCANNER_VERSION, workerId: WORKER_ID }),
    {
      connection,
      concurrency: Number(process.env.FREE_SCAN_CONCURRENCY ?? 1),
    },
  );
  freeScanWorker.on("failed", (job, error) => {
    childLogger({ jobId: job?.id, freeScanId: job?.data.freeScanId }).warn(
      { err: error },
      "free scan job failed",
    );
  });
  workers.push({ name: QUEUE_NAMES.freeScan, close: () => freeScanWorker.close() });
}

/*
 * ⚠️ NOTIFICATION CONCURRENCY IS HIGH AND REPORT CONCURRENCY IS LOW, and that
 * is the whole reason these are separate queues. §12.3 requires a critical
 * issue to reach a mailbox within 60 seconds; a PDF render sitting in front of
 * it on a shared queue is that criterion failing invisibly.
 */
if (hasRole("notification")) {
  const notificationWorker = createNotificationWorker(
    (job: Job<NotificationJobData>) => dispatchNotification(job.data, { emailQueue }),
    { connection, concurrency: Number(process.env.NOTIFICATION_CONCURRENCY ?? 10) },
  );
  notificationWorker.on("failed", (job, error) => {
    childLogger({ jobId: job?.id, agencyId: job?.data.agencyId }).error(
      { err: error },
      "notification job failed",
    );
  });
  workers.push({
    name: QUEUE_NAMES.notification,
    close: () => notificationWorker.close(),
  });
}

if (hasRole("email")) {
  const emailWorker = createEmailWorker(
    (job: Job<EmailJobData>) => processEmailJob(job.data),
    { connection, concurrency: Number(process.env.EMAIL_CONCURRENCY ?? 5) },
  );
  emailWorker.on("failed", (job, error) => {
    // Logged at warn, not error: §9.5 expects retries across a Resend outage,
    // and paging on every attempt would page for two hours over one incident.
    childLogger({ jobId: job?.id, agencyId: job?.data.agencyId }).warn(
      { err: error, attempt: job?.attemptsMade },
      "email send failed; will retry",
    );
  });
  workers.push({ name: QUEUE_NAMES.email, close: () => emailWorker.close() });
}

if (hasRole("report")) {
  const reportWorker = createReportWorker(
    (job: Job<ReportJobData>) => generateReport(job.data, { notificationQueue }),
    // ⚠️ Deliberately low. Each render owns a Chromium page; §10.12 budgets
    // p50 under 30 s and p95 under 120 s, and going wide trades both for
    // throughput nobody asked for.
    { connection, concurrency: Number(process.env.REPORT_CONCURRENCY ?? 2) },
  );
  reportWorker.on("failed", (job, error) => {
    childLogger({ jobId: job?.id, agencyId: job?.data.agencyId }).error(
      { err: error },
      "report job failed",
    );
  });
  workers.push({ name: QUEUE_NAMES.report, close: () => reportWorker.close() });
}

if (hasRole("ai")) {
  const aiWorker = createAiWorker(
    (job: Job<AiJobData>) => processAiJob(job.data),
    /*
     * ⚠️ §7.2 FIXES THIS AT 5, AND THE LIMIT IS THE PROVIDER'S, NOT OURS. The
     * work is pure I/O, so the email worker's width would be tempting — and
     * would turn a burst of auto-explains into a wall of 429s, each one a
     * retry against the same limit. It is also the only queue whose backlog
     * costs money to drain.
     */
    { connection, concurrency: Number(process.env.AI_CONCURRENCY ?? 5) },
  );
  aiWorker.on("failed", (job, error) => {
    /*
     * ⚠️ WARN, NOT ERROR — and this is a product decision, not log tidying.
     * P3 says findings render with or without AI, so a failed explanation
     * degrades one section of one page and nothing else. Paging on it would
     * train the on-call to ignore a channel that also carries scan failures.
     * The `AIRequest` row is already written either way, which is where the
     * real signal lives (§8.6's per-feature failure rate).
     */
    childLogger({ jobId: job?.id, agencyId: job?.data.agencyId }).warn(
      { err: error, attempt: job?.attemptsMade },
      "ai job failed",
    );
  });
  workers.push({ name: QUEUE_NAMES.ai, close: () => aiWorker.close() });
}

if (hasRole("digest")) {
  const digestWorker = createDigestWorker(
    (job: Job<DigestJobData>) => runDigest(job.data, { emailQueue }),
    { connection, concurrency: 1 },
  );
  digestWorker.on("failed", (job, error) => {
    childLogger({ jobId: job?.id }).error({ err: error }, "digest job failed");
  });
  workers.push({ name: QUEUE_NAMES.digest, close: () => digestWorker.close() });
}

// The scheduler runs IN the worker process rather than as its own service:
// it is a database sweep on a timer, and a second deployable would need its own
// leader election to avoid double-sweeping (§7.5). Set WORKER_ROLES without
// `scheduler` on the replicas that should not sweep.
const stopScheduler = hasRole("scheduler")
  ? startScheduler(connection, Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000))
  : null;

/*
 * The digest scheduler arms one job per DISTINCT TIMEZONE, never one per
 * agency (§6.6). It rides on the same `scheduler` role so two replicas cannot
 * both arm the same day's digest.
 */
const stopDigestScheduler = hasRole("scheduler") ? startDigestScheduler(connection) : null;

logger.info(
  {
    workerId: WORKER_ID,
    concurrency: CONCURRENCY,
    roles: ROLES,
    queues: workers.map((entry) => entry.name),
    scheduler: stopScheduler !== null,
  },
  "worker ready",
);

/**
 * Shutdown order matters and is the whole point of this block:
 *   1. Every worker stops taking NEW jobs and waits for in-flight ones.
 *   2. BOTH browsers close — the scan pool and the report renderer's, which are
 *      deliberately separate (§6.8) and therefore both leak if either is missed.
 *   3. Queue producers, then Redis last, because steps 1 and 2 report through it.
 */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "worker shutting down");

  try {
    stopScheduler?.();
    stopDigestScheduler?.();
    // 1. Stop taking NEW jobs on every queue and let in-flight ones finish.
    await Promise.all(workers.map((entry) => entry.close()));
    // 2. Then close both browsers — after, so nothing loses one mid-render.
    await pool.close(30_000);
    await closeReportBrowser();
    // 3. Producers, then Redis last: steps 1 and 2 still report through it.
    //    `closeAiRedis` releases the AI job's own connection — it is separate
    //    from `connection` because the ports do plain GET/SET/INCR, which must
    //    not share a client BullMQ has configured for blocking reads.
    await Promise.all([notificationQueue.close(), emailQueue.close(), aiQueue.close()]);
    await closeAiRedis();
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
