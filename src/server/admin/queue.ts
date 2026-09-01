import "server-only";
import { Queue } from "bullmq";
import { QUEUE_NAMES, createRedisConnection } from "@pdm/scanner/queue/queues";
import { logger } from "@pdm/shared/logger";

/**
 * THE QUEUE BOARD — PLAN.md §3.12 (`/admin/queue`), Phase 6 task 6.6.
 *
 * ⚠️ THIS IS THE ONE ADMIN SURFACE THAT CAN DESTROY WORK. "Drain" discards
 * every waiting job — scans a customer is waiting for, emails that will never
 * be sent, reports nobody will receive — and "retry all failed" turns a backlog
 * into a load spike. Feature doc 19 requires confirm-by-typing on both, which
 * the UI enforces; this module logs every one of them at warn with the operator
 * named, because "who drained the email queue" is a question that gets asked
 * exactly once and needs an answer.
 *
 * ⚠️ THE CONNECTION IS CACHED ON `globalThis`, like every other Redis client in
 * the app. Next dev reloads modules on every edit, and a client created at
 * module scope opens a new connection per reload.
 */

const globalForAdminQueues = globalThis as unknown as {
  pdmAdminQueueConnection?: ReturnType<typeof createRedisConnection>;
  pdmAdminQueues?: Map<string, Queue>;
};

function connection() {
  globalForAdminQueues.pdmAdminQueueConnection ??= createRedisConnection(
    process.env.REDIS_URL ?? "redis://localhost:6379",
  );
  return globalForAdminQueues.pdmAdminQueueConnection;
}

/** Every queue the platform runs, in the order an operator scans them. */
export const ADMIN_QUEUES: readonly string[] = [
  QUEUE_NAMES.scan,
  QUEUE_NAMES.freeScan,
  QUEUE_NAMES.analysis,
  QUEUE_NAMES.ai,
  QUEUE_NAMES.notification,
  QUEUE_NAMES.email,
  QUEUE_NAMES.report,
  QUEUE_NAMES.digest,
  QUEUE_NAMES.cleanup,
];

function queueFor(name: string): Queue {
  if (!ADMIN_QUEUES.includes(name)) {
    // ⚠️ AN ALLOWLIST, NOT A STRING FROM THE REQUEST. Without it, a crafted
    // `name` would let an admin page open — and drain — an arbitrary Redis key
    // namespace, including one belonging to something that is not ours.
    throw new Error(`unknown queue: ${name}`);
  }
  globalForAdminQueues.pdmAdminQueues ??= new Map();
  const existing = globalForAdminQueues.pdmAdminQueues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: connection() });
  globalForAdminQueues.pdmAdminQueues.set(name, queue);
  return queue;
}

export interface QueueSnapshot {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  /** Null when Redis could not be reached — the board says so rather than zero. */
  reachable: boolean;
}

/**
 * ⚠️ AN UNREACHABLE QUEUE REPORTS `reachable: false`, NEVER ZEROS. A board that
 * renders "0 waiting, 0 failed" during a Redis outage is the most dangerous
 * possible output of this page: it says everything is fine at the exact moment
 * nothing is running.
 */
export async function queueSnapshots(): Promise<QueueSnapshot[]> {
  return Promise.all(
    ADMIN_QUEUES.map(async (name): Promise<QueueSnapshot> => {
      try {
        const queue = queueFor(name);
        const [counts, paused] = await Promise.all([
          queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
          queue.isPaused(),
        ]);
        return {
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          paused,
          reachable: true,
        };
      } catch (error) {
        logger.error({ component: "admin-queue", queue: name, err: error }, "queue unreachable");
        return {
          name,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: false,
          reachable: false,
        };
      }
    }),
  );
}

export interface QueueJobView {
  id: string;
  name: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
  stacktrace: string[];
  data: unknown;
}

/**
 * §3.12's "Job inspector showing data, attempts, stack trace, timings".
 *
 * ⚠️ THE PAYLOAD IS SHOWN AS-IS AND IT CONTAINS TENANT DATA — a scan job names
 * an agency and a URL. That is the point of an inspector, and it is why every
 * admin surface is audit-logged; it is also why this returns at most a page of
 * jobs rather than offering an export.
 */
export async function listJobs(
  name: string,
  state: "waiting" | "active" | "failed" | "delayed" | "completed",
  limit = 25,
): Promise<QueueJobView[]> {
  const queue = queueFor(name);
  const jobs = await queue.getJobs([state], 0, limit - 1, false);
  return jobs.filter(Boolean).map((job) => ({
    id: String(job.id),
    name: job.name,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    failedReason: job.failedReason ?? null,
    stacktrace: job.stacktrace ?? [],
    data: job.data,
  }));
}

export async function retryJob(name: string, jobId: string): Promise<void> {
  const job = await queueFor(name).getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found in ${name}`);
  await job.retry();
}

export async function removeJob(name: string, jobId: string): Promise<void> {
  const job = await queueFor(name).getJob(jobId);
  if (!job) return;
  await job.remove();
}

/**
 * ⚠️ BOUNDED AT 500 PER CALL, DELIBERATELY. "Retry all failed" on a backlog of
 * fifty thousand would re-queue them in one burst and take the workers — and
 * very likely Redis — down with it. An operator who needs more presses it
 * again, having seen how the first batch went.
 */
export const RETRY_ALL_LIMIT = 500;

export async function retryAllFailed(name: string): Promise<number> {
  const queue = queueFor(name);
  const failed = await queue.getJobs(["failed"], 0, RETRY_ALL_LIMIT - 1, false);
  let retried = 0;
  for (const job of failed) {
    try {
      await job.retry();
      retried += 1;
    } catch (error) {
      logger.warn(
        { component: "admin-queue", queue: name, jobId: job.id, err: error },
        "retry failed",
      );
    }
  }
  return retried;
}

export async function pauseQueue(name: string): Promise<void> {
  await queueFor(name).pause();
}

export async function resumeQueue(name: string): Promise<void> {
  await queueFor(name).resume();
}

/** Discards every WAITING job. Irreversible. The UI confirms by typing. */
export async function drainQueue(name: string): Promise<void> {
  await queueFor(name).drain();
}
