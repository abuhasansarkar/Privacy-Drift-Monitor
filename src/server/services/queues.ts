import "server-only";
import {
  createEmailQueue,
  createFreeScanQueue,
  createNotificationQueue,
  createReportQueue,
  createRedisConnection,
} from "@pdm/scanner/queue/queues";
import { redisRateLimitStore, type RateLimitStore } from "@pdm/shared";

/**
 * THE WEB APP'S QUEUE PRODUCERS — PLAN.md Part VII §7.1.
 *
 * ⚠️ THE APP ONLY EVER PUBLISHES. Consuming happens in `worker/`, which is a
 * separate process for the reasons §7.1 gives — a Playwright render inside a
 * Next server would hold a request thread and take the site down with it.
 *
 * ⚠️ CACHED ON `globalThis`, like the scan queue and the Prisma client. Next
 * dev reloads modules on every edit, and a connection created at module scope
 * would open a new Redis client per reload and exhaust the connection limit
 * within an afternoon.
 */

const globalForQueues = globalThis as unknown as {
  pdmNotificationQueue?: ReturnType<typeof createNotificationQueue>;
  pdmEmailQueue?: ReturnType<typeof createEmailQueue>;
  pdmReportQueue?: ReturnType<typeof createReportQueue>;
  pdmFreeScanQueue?: ReturnType<typeof createFreeScanQueue>;
  pdmQueueConnection?: ReturnType<typeof createRedisConnection>;
  pdmRateLimitStore?: RateLimitStore;
};

function connection() {
  globalForQueues.pdmQueueConnection ??= createRedisConnection(
    process.env.REDIS_URL ?? "redis://localhost:6379",
  );
  return globalForQueues.pdmQueueConnection;
}

export function notificationQueue() {
  globalForQueues.pdmNotificationQueue ??= createNotificationQueue(connection());
  return globalForQueues.pdmNotificationQueue;
}

export function emailQueue() {
  globalForQueues.pdmEmailQueue ??= createEmailQueue(connection());
  return globalForQueues.pdmEmailQueue;
}

export function reportQueue() {
  globalForQueues.pdmReportQueue ??= createReportQueue(connection());
  return globalForQueues.pdmReportQueue;
}

export function freeScanQueue() {
  globalForQueues.pdmFreeScanQueue ??= createFreeScanQueue(connection());
  return globalForQueues.pdmFreeScanQueue;
}

/**
 * The shared rate-limit store, on the same Redis connection as the queues.
 *
 * ⚠️ REDIS, NOT MEMORY, AND THAT IS THE WHOLE POINT OF THE LIMITER. §3.2's free
 * scanner allows "3 scans / hour per IP". An in-process counter makes that "3
 * per hour PER INSTANCE", so the limit multiplies by the replica count and
 * resets on every deploy — which is not a limit, it is a suggestion, and it is
 * exactly the failure `rate-limit.ts` warns about at the top of the file.
 */
export function rateLimitStore(): RateLimitStore {
  globalForQueues.pdmRateLimitStore ??= redisRateLimitStore(connection());
  return globalForQueues.pdmRateLimitStore;
}
