import { repositoriesFor } from "@pdm/database/repositories";
import type { ConsentPhase, PhaseStatus, ScanStatus } from "@pdm/schemas";
import { requirePermission } from "@/server/auth/context";
import { withApiErrors } from "../../../_lib/with-errors";

/**
 * SCAN PROGRESS — §3.9, Phase 2 task 2.16.
 *
 * Polled by the scan page while a scan is QUEUED or RUNNING.
 *
 * ⚠️ POLLING RATHER THAN SSE, DELIBERATELY. A scan takes a minute or two and
 * the page needs four state changes out of it. An SSE stream would hold a
 * server connection open per viewer for the whole scan — on a serverless
 * deployment that is a request that cannot be recycled, and on a container it
 * is a connection per open tab. A three-second poll of one indexed row is
 * cheaper than the machinery to avoid it.
 *
 * ⚠️ It returns PHASE ROWS, not a percentage the server invented. The client
 * derives the bar from how many phases exist — the server reports facts, and
 * a "62%" with nothing behind it is exactly the kind of number this product
 * does not emit.
 */

export interface ScanProgressPayload {
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  phases: Array<{
    phase: ConsentPhase;
    status: PhaseStatus;
    errorMessage: string | null;
  }>;
}

async function handleGET(
  _request: Request,
  context: RouteContext<"/api/v1/scans/[id]/progress">,
) {
  // Re-checked here: a route handler is not covered by the page's gate, and
  // this one returns tenant data (§6.1).
  const ctx = await requirePermission("scan:read");
  const { id: scanId } = await context.params;

  const repos = repositoriesFor(ctx.agencyId);
  const scan = await repos.scans.withPhases(scanId);

  // Tenant-scoped, so another agency's scan is simply not found — a 403 here
  // would confirm the id exists somewhere the caller cannot see (§6.2).
  if (!scan) return Response.json({ error: "not_found" }, { status: 404 });

  const payload: ScanProgressPayload = {
    status: scan.status,
    startedAt: scan.startedAt?.toISOString() ?? null,
    finishedAt: scan.finishedAt?.toISOString() ?? null,
    phases: scan.phases.map((phase) => ({
      phase: phase.phase,
      status: phase.status,
      errorMessage: phase.errorMessage,
    })),
  };

  return Response.json(payload);
}

export const GET = withApiErrors(handleGET);
