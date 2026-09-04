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
  ai: "pdm-ai",
  cleanup: "pdm-cleanup",
  /*
   * ⚠️ §7.2 CALLS THIS QUEUE `scan:free`. IT CANNOT BE. A colon in a BullMQ
   * queue name collides with BullMQ's own Redis key separator — the trap this
   * file already documents for job ids, and the one AGENTS.md records as a
   * production defect. The plan's name is the concept; `pdm-scan-free` is the
   * spelling.
   *
   * ⚠️ IT IS A SEPARATE QUEUE, NOT A PRIORITY ON `scan`. §3.2's control is
   * "cannot starve paying customers", and a shared queue cannot give that
   * guarantee: BullMQ priorities are advisory within one queue, and a thousand
   * anonymous submissions still occupy the same worker concurrency. Two queues
   * with separately-capped concurrency is the only arrangement where a flood of
   * free scans is physically incapable of taking a paid browser slot.
   */
  freeScan: "pdm-scan-free",
  webhook: "pdm-webhook",
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

/**
 * One anonymous scan. PLAN.md §3.2, Phase 6 task 6.5.
 *
 * ⚠️ IT CARRIES NO `agencyId`, BECAUSE THERE IS NO TENANT. `FreeScan` is
 * pre-tenant by design (§5.9) and the result never touches a tenant table — a
 * free scan that wrote into `Scan` would put an anonymous submitter's data
 * inside somebody's agency, which is the one thing multi-tenancy must never do.
 */
export interface FreeScanJobData {
  freeScanId: string;
  url: string;
  registrableDomain: string;
}

/**
 * ⚠️ THE FREE QUEUE'S RETRY POLICY IS ONE ATTEMPT, DELIBERATELY. A paid scan is
 * worth three browser slots because a customer is waiting on a promise we sold
 * them. An anonymous scan of an unreachable site is worth one: retrying it
 * spends the scarcest resource in the system on a lead that may not exist, and
 * the result page's "try again" button is a cheaper, human-gated retry.
 */
export const FREE_SCAN_JOB_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { age: 3600, count: 200 },
  removeOnFail: { age: 24 * 3600, count: 200 },
};

export function createFreeScanQueue(
  connection: ConnectionOptions,
): Queue<FreeScanJobData> {
  return new Queue<FreeScanJobData>(QUEUE_NAMES.freeScan, {
    connection,
    defaultJobOptions: FREE_SCAN_JOB_OPTIONS,
  });
}

export async function enqueueFreeScan(
  queue: Queue<FreeScanJobData>,
  data: FreeScanJobData,
): Promise<void> {
  await queue.add("free-scan", data, { jobId: toJobId(data.freeScanId) });
}

/**
 * §3.2's circuit breaker: "If the free-scan queue exceeds 200 waiting jobs, new
 * submissions get 'high demand, try later'."
 *
 * ⚠️ IT COUNTS WAITING JOBS, NOT ACTIVE ONES. Active jobs are bounded by worker
 * concurrency and always will be; the backlog is the thing that grows without
 * limit and the thing a submitter's wait time is actually made of. Accepting a
 * 201st job is not a capacity failure — it is a promise of a result that will
 * arrive an hour later, to somebody evaluating whether to buy.
 */
export const FREE_SCAN_QUEUE_CEILING = Number(
  process.env.FREE_SCAN_QUEUE_CEILING ?? 200,
);

export async function freeScanQueueAtCapacity(
  queue: Queue<FreeScanJobData>,
): Promise<boolean> {
  const waiting = await queue.getWaitingCount();
  return waiting >= FREE_SCAN_QUEUE_CEILING;
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

/**
 * ⚠️ MIRRORS THE PRISMA `NotificationType` ENUM (and `@pdm/schemas`'
 * `notificationType`) — restated here because the scanner package stays
 * DB-free, the same rule as `AiJobData["feature"]`. This union is what the
 * email job writes into `AlertHistory.type`, so a value present at a call
 * site but missing from the DB enum is a runtime Prisma validation error on
 * a job that has ALREADY SENT — which is how the team-invitation job sent
 * duplicate emails on every retry before anyone saw a type error. The
 * queue-contract test fails the build if these lists drift apart.
 */
export const QUEUED_NOTIFICATION_TYPES = [
  "CRITICAL_ISSUE",
  "NEW_TRACKER",
  "CONSENT_REGRESSION",
  "PRIVACY_DRIFT",
  "SCAN_FAILED",
  "SCAN_PARTIAL",
  "WEBSITE_UNREACHABLE",
  "REPORT_READY",
  "REPORT_FAILED",
  "MEMBER_JOINED",
  "TRIAL_ENDING",
  "PAYMENT_FAILED",
  "PLAN_CHANGED",
  "AI_QUOTA_WARNING",
  "USAGE_LIMIT_WARNING",
] as const;

export type QueuedNotificationType = (typeof QUEUED_NOTIFICATION_TYPES)[number];

/** One rendered email. The template payload is validated by `@pdm/email`. */
export interface EmailJobData {
  agencyId: string;
  /** Serialised `EmailMessage` from `@pdm/email`. */
  message: unknown;
  to: string;
  userId: string | null;
  alertRuleId: string | null;
  /**
   * The alert trigger this send belongs to, or null for transactional mail.
   * Typed as the restated enum — NOT `string` — so a value the database does
   * not accept cannot reach the email job.
   */
  notificationType: QueuedNotificationType | null;
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

/* ───────────────────────── Phase 5: the ai queue (§7.2) ─────────────────────
 *
 * ⚠️ ITS OWN QUEUE, for the reason §7.1 gives every other split: an AI backlog
 * must never sit in front of a scan or an alert. It is also the only queue
 * whose work is BILLABLE and whose upstream imposes rate limits, so it needs a
 * retry policy nothing else should inherit.
 */

export interface AiJobData {
  agencyId: string;
  /** Mirrors `AIFeature`. Restated so the scanner package stays DB-free. */
  feature: "EXPLAIN_ISSUE" | "RECOMMEND_FIX" | "SUMMARIZE_DRIFT" | "CLIENT_MESSAGE";
  entityType: string;
  entityId: string;
  issueId: string | null;
  /** Null for work the scheduler started — auto-explain has no requesting user. */
  userId: string | null;
  /**
   * ⚠️ THE BULLMQ JOB ID, AND THEREFORE THE IDEMPOTENCY KEY. Two analysis runs
   * over the same scan must not commission the same explanation twice: the
   * second `add()` for an id already held is ignored. This is the FIRST of two
   * duplicate controls — the `inputHash` cache in `@pdm/ai` is the second, and
   * it catches the case where the job HAS drained but the answer is still good.
   */
  dedupeKey: string;
}

/**
 * §7.2: 2 attempts, exponential from 10 s.
 *
 * ⚠️ TWO ATTEMPTS, NOT FIVE — and the reason is money, not latency. An AI call
 * that failed on a deterministic rejection (a 401, a content filter, an output
 * our validators refuse) answers identically every time, and every attempt is
 * billable. The scanner learned this as the DETERMINISTIC/TRANSIENT split and
 * `packages/email` learned it the hard way by retrying a permanent 403 eight
 * times; `AIResult.retryable` carries the same decision here, and the job
 * inspects it before letting BullMQ try again.
 */
export const AI_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function createAiQueue(connection: ConnectionOptions): Queue<AiJobData> {
  return new Queue<AiJobData>(QUEUE_NAMES.ai, {
    connection,
    defaultJobOptions: AI_JOB_OPTIONS,
  });
}

export async function enqueueAi(
  queue: Queue<AiJobData>,
  data: AiJobData,
): Promise<void> {
  // `toJobId` because a natural key like `agency:EXPLAIN_ISSUE:issue-1` carries
  // colons, and BullMQ throws on those at enqueue time, in production.
  await queue.add("generate", data, { jobId: toJobId(data.dedupeKey) });
}

export interface WebhookJobData {
  deliveryId: string;
  endpointId: string;
  endpointUrl: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export const WEBHOOK_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function createWebhookQueue(
  connection: ConnectionOptions,
): Queue<WebhookJobData> {
  return new Queue<WebhookJobData>(QUEUE_NAMES.webhook, {
    connection,
    defaultJobOptions: WEBHOOK_JOB_OPTIONS,
  });
}

export async function enqueueWebhook(
  queue: Queue<WebhookJobData>,
  data: WebhookJobData,
  options?: JobsOptions,
): Promise<void> {
  await queue.add("dispatch", data, {
    jobId: toJobId(data.deliveryId),
    ...options,
  });
}

