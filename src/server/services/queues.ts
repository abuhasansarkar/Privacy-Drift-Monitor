import "server-only";
import {
  createEmailQueue,
  createNotificationQueue,
  createReportQueue,
  createRedisConnection,
} from "@pdm/scanner/queue/queues";

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
  pdmQueueConnection?: ReturnType<typeof createRedisConnection>;
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
