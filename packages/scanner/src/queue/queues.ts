import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

/**
 * QUEUES — PLAN.md Part VII §7.1–§7.4, Phase 2 task 2.1.
 *
 * One queue per class of work, not one queue with a `type` field. Separate
 * queues are what let a backlog of report generation stay out of the way of
 * scanning, and what let the two be scaled independently (§7.1) — a single
 * queue makes head-of-line blocking a matter of luck.
 */

/**
 * ⚠️ NO COLONS. BullMQ builds its own Redis keys as `bull:<queue>:<id>` and
 * rejects a name containing `:` at construction — `pdm:scan` threw on worker
 * startup. Dashes keep the namespacing readable without colliding with the
 * key scheme.
 */
export const QUEUE_NAMES = {
  scan: "pdm-scan",
  analysis: "pdm-analysis",
  report: "pdm-report",
  notification: "pdm-notification",
  cleanup: "pdm-cleanup",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * ⚠️ `maxRetriesPerRequest: null` is REQUIRED by BullMQ for a blocking
 * connection, not a preference. ioredis defaults to 20 and then throws, which
 * ends the worker's blocking `BRPOPLPUSH` and silently stops job consumption —
 * a worker that looks alive and processes nothing.
 */
export function createRedisConnection(url: string): IORedis {
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

/**
 * Retry policy (§7.4, §4.4).
 *
 * Exponential backoff from 30s. Three attempts, because a browser slot is the
 * scarcest resource in the system and a fourth attempt on a site that has
 * failed three times is nearly always a permanent failure being paid for again.
 *
 * ⚠️ The DETERMINISTIC/TRANSIENT split in `types.ts` still governs: the worker
 * inspects the error before letting BullMQ retry, so an SSRF block or a 404 is
 * failed immediately rather than burning all three attempts.
 */
export const SCAN_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  // Keep a bounded history: enough to debug yesterday, not enough to fill Redis.
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export interface ScanJobData {
  scanId: string;
  websiteId: string;
  agencyId: string;
  url: string;
  registrableDomain: string;
  monitoredPaths: string[];
  respectRobots: boolean;
  blockMedia: boolean;
  /**
   * Mirrors the Prisma `ScanTrigger` enum character for character.
   *
   * ⚠️ Restated rather than imported: `packages/scanner` must stay testable
   * without a database (feature doc 05), so it cannot depend on the generated
   * client. The value is cast at the persistence boundary, and a member that
   * drifts from the schema fails there — which is why it must match exactly.
   */
  trigger:
    | "SCHEDULED"
    | "MANUAL"
    | "VERIFICATION"
    | "ONBOARDING"
    | "API"
    | "FREE_PUBLIC";
}

export function createScanQueue(connection: ConnectionOptions): Queue<ScanJobData> {
  return new Queue<ScanJobData>(QUEUE_NAMES.scan, {
    connection,
    defaultJobOptions: SCAN_JOB_OPTIONS,
  });
}

/**
 * Enqueues a scan, keyed by `scanId`.
 *
 * ⚠️ THE JOB ID IS THE IDEMPOTENCY KEY. BullMQ ignores an add() for a jobId it
 * already holds, so a double-click on "Scan now", a webhook replay, or a
 * scheduler that runs twice cannot produce two scans of the same site — which
 * would burn two browser slots and then race to write the same row (§7.4).
 */
export async function enqueueScan(
  queue: Queue<ScanJobData>,
  data: ScanJobData,
): Promise<void> {
  await queue.add("scan", data, { jobId: data.scanId });
}
