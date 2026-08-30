/**
 * LIVENESS — PLAN.md Part X §10.8.
 *
 * "Is this process alive?" and nothing more. It touches NO dependencies on
 * purpose: if this checked Postgres, a database blip would make the platform
 * kill and reschedule healthy web containers, turning a degraded read path into
 * a full outage. Dependency checks belong in /api/health/ready.
 *
 * Route Handler GET is not cached by default in Next 16 — no `force-dynamic`
 * needed (Part 0 §0.4).
 */
export async function GET() {
  return Response.json({
    status: "ok",
    service: process.env.SERVICE_NAME ?? "web",
    version: process.env.GIT_SHA ?? "dev",
    time: new Date().toISOString(),
  });
}
