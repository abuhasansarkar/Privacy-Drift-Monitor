import "server-only";
import { unsafeGlobalClient } from "@pdm/database";
import { createRedisConnection } from "@pdm/scanner/queue/queues";
import { isStripeConfigured } from "@pdm/billing";
import { objectStore } from "@pdm/storage";
import { sentryConfigured } from "@/lib/sentry";

/**
 * DEPENDENCY HEALTH — PLAN.md Part X §10.8, §10.11, §3.12's `/admin/system-health`.
 *
 * ⚠️ ONE MODULE, TWO CONSUMERS: the readiness probe and the admin page. They
 * were about to be two implementations, and the failure mode of that is
 * specific and bad — the probe says the container is healthy while the page an
 * operator is staring at says Redis is down, and nobody can tell which is
 * lying. One definition of "reachable" removes the question.
 *
 * ⚠️ THE FATAL/DEGRADED SPLIT IS §10.11's, VERBATIM, AND IT IS NOT INTUITIVE:
 *
 *   Postgres down → NOT READY. The app cannot serve; take it out of rotation.
 *   Redis down    → STILL READY. Reads work, caches miss, enqueueing returns a
 *                   clear 503. Marking the container unready would take down a
 *                   perfectly readable app and remove the page that explains why.
 *   S3 down       → STILL READY. Scans complete, evidence rows persist, and
 *                   screenshot upload retries.
 *
 * Getting this backwards means a Redis blip recycles every container.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): a `SELECT 1` against no table. There is
  // no tenant to scope to — the platform calls the probe with no session at all.
  "dependency health checks touch no tenant data",
);

export interface HealthCheck {
  name: string;
  ok: boolean;
  /** A failure here means the container should leave rotation. */
  fatal: boolean;
  ms: number;
  error?: string;
  /** Reported separately from `ok`: an unconfigured service is not a failure. */
  configured: boolean;
}

async function timed(
  name: string,
  fatal: boolean,
  configured: boolean,
  fn: () => Promise<unknown>,
): Promise<HealthCheck> {
  if (!configured) {
    return { name, ok: true, fatal, ms: 0, configured: false };
  }
  const started = performance.now();
  try {
    await fn();
    return { name, ok: true, fatal, ms: Math.round(performance.now() - started), configured: true };
  } catch (error) {
    return {
      name,
      ok: false,
      fatal,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
      configured: true,
    };
  }
}

/**
 * ⚠️ THE REDIS CHECK OPENS ITS OWN CONNECTION AND CLOSES IT. Reusing the queue
 * connection would report "healthy" from a client that ioredis is silently
 * retrying in the background — which is exactly the state the check exists to
 * detect. A fresh PING is the only honest answer to "can we reach Redis now".
 */
async function pingRedis(): Promise<void> {
  const client = createRedisConnection(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    await client.ping();
  } finally {
    client.disconnect();
  }
}

export async function dependencyHealth(): Promise<HealthCheck[]> {
  return Promise.all([
    timed("postgres", true, true, () => db.$queryRaw`SELECT 1`),
    timed("redis", false, true, pingRedis),
    /*
     * ⚠️ A LIST, NOT A WRITE. A health check that uploads a probe object writes
     * garbage to the bucket on every readiness poll — once every few seconds,
     * for the life of the deployment. Listing proves credentials and
     * reachability, which is what the check is for.
     */
    /*
     * ⚠️ CONFIGURED MEANS THE CREDENTIALS ARE SET, NOT THAT A BUCKET NAME HAS A
     * DEFAULT. `storageConfigFromEnv` defaults the bucket to `drift-monitor`,
     * so testing for the bucket would report "configured" in an environment
     * with no keys at all and then fail the check every poll.
     */
    timed("storage", false, Boolean(process.env.S3_ACCESS_KEY), () =>
      objectStore().deletePrefix("__healthcheck__/never-written/"),
    ),
  ]);
}

/** External services we depend on but do not probe — configuration status only. */
export function externalServices() {
  return [
    { name: "Clerk", configured: Boolean(process.env.CLERK_SECRET_KEY) },
    { name: "Stripe", configured: isStripeConfigured() },
    { name: "Resend", configured: Boolean(process.env.RESEND_API_KEY) },
    { name: "OpenAI", configured: Boolean(process.env.OPENAI_API_KEY) },
    { name: "Turnstile", configured: Boolean(process.env.TURNSTILE_SECRET_KEY) },
    // Through the helper, so "configured" here means the same thing it means
    // to `instrumentation.ts` — including the NEXT_PUBLIC_ fallback.
    { name: "Sentry", configured: sentryConfigured() },
  ];
}

/**
 * Worker liveness, inferred from work actually finishing.
 *
 * ⚠️ THERE IS NO HEARTBEAT TABLE, AND THIS IS BETTER THAN ONE. A heartbeat
 * proves a process is running; a finished scan proves it is doing its job. A
 * worker that is alive and wedged — a leaked browser context, a stuck pool —
 * writes heartbeats forever and completes nothing, which is the failure mode
 * AGENTS.md warns takes a worker down "within hours".
 */
export async function workerActivity() {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent, running] = await Promise.all([
    db.scan.groupBy({
      by: ["workerId"],
      where: { finishedAt: { gte: since }, workerId: { not: null } },
      _count: { _all: true },
      _max: { finishedAt: true },
    }),
    db.scan.count({ where: { status: "RUNNING" } }),
  ]);

  return {
    workers: recent.map((row) => ({
      workerId: row.workerId ?? "unknown",
      completedLastHour: row._count._all,
      lastFinishedAt: row._max.finishedAt,
    })),
    running,
  };
}
