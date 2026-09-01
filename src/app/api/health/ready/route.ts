import { dependencyHealth } from "@/server/admin/health";

/**
 * READINESS — PLAN.md Part X §10.8, §10.11, Phase 0 acceptance ("health
 * endpoints report dependency status").
 *
 * ⚠️ THE CHECKS THEMSELVES LIVE IN `server/admin/health.ts`, SHARED WITH
 * `/admin/system-health`. They used to live here, with `TODO(Phase 2)` markers
 * where Redis and object storage should have been — so for four phases this
 * endpoint reported a healthy container on the strength of Postgres alone, and
 * the admin page that would have contradicted it did not exist yet. One
 * definition, two consumers, no way for them to disagree.
 *
 * ⚠️ ONLY POSTGRES IS FATAL. §10.11: Redis down still serves reads and returns
 * a clear 503 on enqueue; S3 down still completes scans and retries uploads.
 * Marking the container unready for either would recycle every replica over a
 * dependency the app is designed to degrade around. Both are reported as
 * degraded instead, so the operator alert fires without the platform acting.
 */
export async function GET() {
  const checks = await dependencyHealth();

  const fatalFailure = checks.some((check) => !check.ok && check.fatal);
  const degraded = checks.some((check) => !check.ok && !check.fatal);

  return Response.json(
    {
      status: fatalFailure ? "unready" : degraded ? "degraded" : "ok",
      checks: checks.map(({ name, ok, ms, error, configured }) => ({
        name,
        ok,
        ms,
        error,
        configured,
      })),
      time: new Date().toISOString(),
    },
    { status: fatalFailure ? 503 : 200 },
  );
}
