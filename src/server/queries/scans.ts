import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { AgencyContext } from "@/server/auth/context";
import type { ScanPhaseView } from "@/components/scans/scan-phases";

/**
 * SCAN QUERIES — §3.9, Phase 2 task 2.15.
 *
 * ⚠️ Per-phase counts are computed with `groupBy` in the database rather than
 * by loading the evidence and counting in JS. A busy site records thousands of
 * requests per scan, and the detail page shows four numbers — pulling megabytes
 * to produce them is how a page that "works locally" times out on a real
 * customer's site.
 */

export async function getScanDetail(ctx: AgencyContext, scanId: string) {
  const repos = repositoriesFor(ctx.agencyId);

  const scan = await repos.scans.withPhases(scanId);
  if (!scan) return null;

  const [requestGroups, cookieGroups] = await Promise.all([
    repos.db.networkRequest.groupBy({
      by: ["consentPhase"],
      where: { scanId },
      _count: { _all: true },
    }),
    repos.db.cookieRecord.groupBy({
      by: ["consentPhase"],
      where: { scanId },
      _count: { _all: true },
    }),
  ]);

  const requestCounts = new Map(
    requestGroups.map((group) => [group.consentPhase, group._count._all]),
  );
  const cookieCounts = new Map(
    cookieGroups.map((group) => [group.consentPhase, group._count._all]),
  );

  const phases: ScanPhaseView[] = scan.phases.map((phase) => ({
    phase: phase.phase,
    status: phase.status,
    requestCount: requestCounts.get(phase.phase) ?? 0,
    cookieCount: cookieCounts.get(phase.phase) ?? 0,
    // Shown verbatim. The UI never turns a missing reason into a friendlier
    // one — "could not be determined" with no detail is more honest than a
    // guess at why.
    detail: phase.errorMessage ?? undefined,
  }));

  return { scan, phases };
}

export async function getScanRequests(
  ctx: AgencyContext,
  scanId: string,
  page: number,
  perPage: number,
) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.scans.requests(scanId, {
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

export async function getWebsiteScans(ctx: AgencyContext, websiteId: string) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.scans.listForWebsite(websiteId, 20);
}
