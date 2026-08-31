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
  email: "pdm-email",
  digest: "pdm-digest",
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

/* ───────────────────────── Phase 4 queues (§7.2) ─────────────────────────
 *
 * ⚠️ FOUR SEPARATE QUEUES, NOT ONE WITH A `kind` FIELD. §7.1: a backlog of
 * report generation must stay out of the way of scanning, and the two must
 * scale independently. A shared queue makes head-of-line blocking a matter of
 * luck — a 90-second PDF render sitting in front of a critical-issue email is
 * the acceptance criterion ("email within 60 s") failing for a reason nobody
 * can see in the code.
 */

export interface NotificationJobData {
  agencyId: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  linkUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  websiteId: string | null;
  websiteGroupId: string | null;
  clientId: string | null;
  websiteLabel: string | null;
  /**
   * ⚠️ THE DEDUPLICATION IDENTITY, and the BullMQ job id. A scan that produces
   * the same finding twice, a retried analysis job and a replayed webhook all
   * collapse to one alert here, before the dispatcher's 4-hour window is even
   * consulted (§6.6).
   */
  dedupeKey: string;
}

/** One rendered email. The template payload is validated by `@pdm/email`. */
export interface EmailJobData {
  agencyId: string;
  /** Serialised `EmailMessage` from `@pdm/email`. */
  message: unknown;
  to: string;
  userId: string | null;
  alertRuleId: string | null;
  notificationType: string | null;
  entityType: string | null;
  entityId: string | null;
  /** §9.5 — checked against `AlertHistory` before dispatch. */
  idempotencyKey: string;
}

export interface ReportJobData {
  agencyId: string;
  reportId: string;
  requestedByUserId: string;
}

/**
 * ⚠️ ONE REPEATABLE JOB PER DISTINCT TIMEZONE, NOT PER AGENCY (§6.6). The job
 * carries the zone and the worker fans out to the agencies in it.
 */
export interface DigestJobData {
  timeZone: string;
  frequency: "DAILY" | "WEEKLY";
}

/**
 * Alerts must reach a mailbox within 60 seconds (§12.3), so this queue retries
 * fast and briefly — a slow first backoff spends the whole budget waiting.
 */
export const NOTIFICATION_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * §9.5 gives email roughly two hours of retries so a Resend outage delays mail
 * rather than losing it. In-app notifications are already written by this point
 * and are unaffected throughout.
 */
export const EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 8,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

/**
 * ⚠️ ONE ATTEMPT PLUS ONE RETRY. A report that failed to render will almost
 * always fail again, and each attempt costs a Chromium page render. §12.3 also
 * requires that a failed report not consume the allowance, so burning five
 * attempts buys nothing and delays the failure notification the user is
 * waiting on.
 */
export const REPORT_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

export function createNotificationQueue(
  connection: ConnectionOptions,
): Queue<NotificationJobData> {
  return new Queue<NotificationJobData>(QUEUE_NAMES.notification, {
    connection,
    defaultJobOptions: NOTIFICATION_JOB_OPTIONS,
  });
}

export function createEmailQueue(connection: ConnectionOptions): Queue<EmailJobData> {
  return new Queue<EmailJobData>(QUEUE_NAMES.email, {
    connection,
    defaultJobOptions: EMAIL_JOB_OPTIONS,
  });
}

export function createReportQueue(connection: ConnectionOptions): Queue<ReportJobData> {
  return new Queue<ReportJobData>(QUEUE_NAMES.report, {
    connection,
    defaultJobOptions: REPORT_JOB_OPTIONS,
  });
}

export function createDigestQueue(connection: ConnectionOptions): Queue<DigestJobData> {
  return new Queue<DigestJobData>(QUEUE_NAMES.digest, {
    connection,
    // A digest is repeatable and idempotent per (zone, frequency, day); a
    // failed run is picked up by the next tick rather than retried into a
    // duplicate send.
    defaultJobOptions: { attempts: 2, removeOnComplete: { count: 200 } },
  });
}

/**
 * ⚠️ NO COLONS IN A JOB ID EITHER — the same rule as `QUEUE_NAMES` above, and
 * it bites in a different place. BullMQ's `Job.validateOptions` THROWS on
 * "Custom Id cannot contain :", so a natural key like
 * `agency:CRITICAL_ISSUE:issue-1` kills the enqueue at runtime. The database
 * keys keep their colons (they are readable and unique there); only the id
 * handed to BullMQ is rewritten, and the mapping is total, so two keys that
 * differ still produce two job ids.
 */
export function toJobId(key: string): string {
  return key.replace(/:/g, "~");
}

/**
 * ⚠️ THE JOB ID IS THE DEDUPE KEY, and BullMQ ignores an `add()` for an id it
 * already holds. This is the FIRST of the two duplicate controls: it collapses
 * an alert re-enqueued within the queue's retention window, before the
 * dispatcher's database-backed 4-hour check runs at all (§6.6).
 */
export async function enqueueNotification(
  queue: Queue<NotificationJobData>,
  data: NotificationJobData,
): Promise<void> {
  await queue.add("notify", data, { jobId: toJobId(data.dedupeKey) });
}

export async function enqueueEmail(
  queue: Queue<EmailJobData>,
  data: EmailJobData,
  options?: { deliverAt?: Date | null },
): Promise<void> {
  const delay = options?.deliverAt
    ? Math.max(0, options.deliverAt.getTime() - Date.now())
    : 0;
  // ⚠️ A quiet-hours deferral is a DELAYED JOB, not a dropped one (§6.6).
  await queue.add("send", data, { jobId: toJobId(data.idempotencyKey), delay });
}

export async function enqueueReport(
  queue: Queue<ReportJobData>,
  data: ReportJobData,
): Promise<void> {
  await queue.add("generate", data, { jobId: toJobId(data.reportId) });
}
