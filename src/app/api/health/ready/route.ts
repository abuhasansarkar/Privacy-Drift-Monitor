/*
 * Readiness probe: a bare `SELECT 1` with no tenant context and no tenant data.
 * There is no agencyId to scope by — the platform calls this with no session at
 * all — so `forAgency()` does not apply. This is the justified exception to the
 * §5.5 layer-3 lint rule.
 */
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@pdm/database";

/**
 * READINESS — PLAN.md Part X §10.8, Phase 0 acceptance ("health endpoints
 * report dependency status").
 *
 * Used by the platform's readiness probe and by external uptime checks. Unlike
 * liveness, this DOES touch dependencies.
 *
 * Degradation model (§10.11) — this is the part that matters:
 *
 *   Postgres down → not ready. The app cannot serve; take it out of rotation.
 *   Redis down    → STILL READY. Reads work, caches miss, and enqueueing
 *                   returns 503 with a clear message. Marking the container
 *                   unready here would take down a readable app.
 *   S3 down       → STILL READY. Scans complete, evidence rows persist, and
 *                   screenshot upload retries.
 *
 * So only Postgres is fatal. The others are reported as degraded so the
 * operator alert fires without the platform recycling containers.
 */

type Check = { name: string; ok: boolean; fatal: boolean; ms: number; error?: string };

async function timed(
  name: string,
  fatal: boolean,
  fn: () => Promise<unknown>,
): Promise<Check> {
  const started = performance.now();
  try {
    await fn();
    return { name, ok: true, fatal, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return {
      name,
      ok: false,
      fatal,
      ms: Math.round(performance.now() - started),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET() {
  const checks: Check[] = [
    await timed("postgres", true, () => prisma.$queryRaw`SELECT 1`),
    // TODO(Phase 2): redis (fatal: false) once BullMQ lands.
    // TODO(Phase 2): s3 (fatal: false) once packages/storage lands.
  ];

  const fatalFailure = checks.some((c) => !c.ok && c.fatal);
  const degraded = checks.some((c) => !c.ok && !c.fatal);

  return Response.json(
    {
      status: fatalFailure ? "unready" : degraded ? "degraded" : "ok",
      checks: checks.map(({ name, ok, ms, error }) => ({ name, ok, ms, error })),
      time: new Date().toISOString(),
    },
    { status: fatalFailure ? 503 : 200 },
  );
}
