import { unsafeGlobalClient } from "@pdm/database";
import {
  createDigestQueue,
  toJobId,
  type DigestJobData,
} from "@pdm/scanner/queue/queues";
import { isValidTimeZone, nextDailyDigestAt, nextWeeklyDigestAt } from "@pdm/notifications";
import { childLogger } from "@pdm/shared/logger";
import type { Queue } from "bullmq";
import type IORedis from "ioredis";

/**
 * DIGEST SCHEDULER — PLAN.md Part VI §6.6, Part VII §7.5.
 *
 * ⚠️ ONE SCHEDULED JOB PER DISTINCT TIMEZONE IN USE, NEVER ONE PER AGENCY.
 * §6.6 states it directly, and feature doc 13 names the per-agency version as a
 * trap. Ten thousand agencies live in perhaps forty zones.
 *
 * ⚠️ SCHEDULED AS ONE-SHOT DELAYED JOBS, RE-ARMED AFTER EACH RUN, rather than
 * as BullMQ repeatables with a cron expression. A cron string cannot express
 * "08:00 in Europe/London" across a DST transition without the scheduler
 * re-computing it anyway — and a repeatable whose next-run drifts by an hour
 * twice a year is a bug nobody reproduces. `nextDailyDigestAt` does the tz
 * arithmetic once, here, and the delay is exact.
 *
 * ⚠️ RUNS IN THE WORKER, NOT AS ITS OWN SERVICE, and only on the replica whose
 * `WORKER_ROLES` includes `scheduler` — the same rule as the scan scheduler, so
 * two replicas cannot both arm the same day's digest.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): reading the distinct set of agency
  // timezones is cross-tenant by definition.
  "digest scheduling groups every agency by timezone",
);

/** How often to re-check which zones are in use and re-arm anything due. */
const SWEEP_INTERVAL_MS = Number(process.env.DIGEST_SWEEP_INTERVAL_MS ?? 15 * 60 * 1000);

export function startDigestScheduler(connection: IORedis, intervalMs = SWEEP_INTERVAL_MS) {
  const queue = createDigestQueue(connection);
  const log = childLogger({ component: "digest-scheduler" });

  const tick = async () => {
    try {
      const armed = await armDigests(queue, new Date());
      if (armed > 0) log.info({ armed }, "digest jobs armed");
    } catch (error) {
      log.error({ err: error }, "digest scheduling sweep failed");
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  // `unref` so a stopped worker is not held open by a pending timer.
  timer.unref?.();

  return () => {
    clearInterval(timer);
    void queue.close();
  };
}

export async function armDigests(
  queue: Queue<DigestJobData>,
  now: Date,
): Promise<number> {
  const zones = await distinctTimezones();
  let armed = 0;

  for (const timeZone of zones) {
    for (const frequency of ["DAILY", "WEEKLY"] as const) {
      const runAt =
        frequency === "DAILY"
          ? nextDailyDigestAt(now, timeZone)
          : nextWeeklyDigestAt(now, timeZone);

      /*
       * ⚠️ THE JOB ID IS (zone, frequency, calendar day) IN THAT ZONE. BullMQ
       * ignores an `add()` for an id it already holds, so this sweep is
       * idempotent: running every 15 minutes arms each day's digest exactly
       * once, and a restarted worker re-arms nothing that is already pending.
       */
      const jobId = toJobId(
        `digest:${timeZone}:${frequency}:${runAt.toISOString().slice(0, 10)}`,
      );

      await queue.add(
        "digest",
        { timeZone, frequency },
        { jobId, delay: Math.max(0, runAt.getTime() - now.getTime()) },
      );
      armed += 1;
    }
  }

  return armed;
}

/**
 * The zones actually in use.
 *
 * ⚠️ An invalid zone is SKIPPED AND LOGGED, not passed through. `Intl` throws
 * on an unknown zone, and one bad row would otherwise abort the sweep for every
 * agency — including the ones whose timezone is fine.
 */
async function distinctTimezones(): Promise<string[]> {
  const rows = await db.agency.groupBy({
    by: ["timezone"],
    where: { status: "ACTIVE", deletedAt: null },
  });

  const log = childLogger({ component: "digest-scheduler" });
  const zones: string[] = [];
  for (const row of rows) {
    if (isValidTimeZone(row.timezone)) {
      zones.push(row.timezone);
    } else {
      log.warn({ timezone: row.timezone }, "unknown agency timezone; digest skipped");
    }
  }
  return zones;
}
