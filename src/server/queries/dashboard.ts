import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { AgencyContext } from "@/server/auth/context";

/**
 * DASHBOARD READS — §3.4.
 *
 * Every query goes through `repositoriesFor(agencyId).db`, which is the
 * `forAgency()`-scoped client — the raw Prisma client is never reachable from
 * here (P4).
 *
 * ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT RETURN: recent privacy drift. The
 * drift engine and its tables arrive in Phase 3, and rendering "no changes
 * detected" from an unimplemented query would be the UI asserting a fact the
 * scanner never established (P1). The card is absent until the query is real.
 */

export interface DashboardOverview {
  websitesTotal: number;
  websitesActive: number;
  websitesPaused: number;
  websitesNeverScanned: number;
  clientsTotal: number;
  /** Null when nothing has been scanned — never 0. See `HealthScore`. */
  averageHealthScore: number | null;
  openIssues: number;
  criticalIssues: number;
  needsAttention: NeedsAttentionRow[];
}

export interface NeedsAttentionRow {
  id: string;
  url: string;
  clientName: string | null;
  openIssueCount: number;
  criticalIssueCount: number;
  healthScore: number | null;
}

/** §6.2 — an EMPTY scope means all websites in the agency, not none. */
function scopeFilter(websiteScope: readonly string[]) {
  return websiteScope.length === 0 ? {} : { id: { in: [...websiteScope] } };
}

export async function getDashboardOverview(
  ctx: AgencyContext,
): Promise<DashboardOverview> {
  const { db } = repositoriesFor(ctx.agencyId);
  const live = { archivedAt: null, ...scopeFilter(ctx.websiteScope) };

  const [
    websitesTotal,
    websitesActive,
    websitesPaused,
    websitesNeverScanned,
    clientsTotal,
    health,
    issues,
    needsAttention,
  ] = await Promise.all([
    db.website.count({ where: live }),
    db.website.count({ where: { ...live, monitoringStatus: "ACTIVE" } }),
    db.website.count({ where: { ...live, monitoringStatus: "PAUSED" } }),
    db.website.count({ where: { ...live, lastScanAt: null } }),
    db.client.count({ where: { archivedAt: null } }),
    // Averaged over SCANNED sites only. Including never-scanned sites as 0
    // would misreport a healthy portfolio — the same trap the client
    // repository's `averageHealth()` guards.
    db.website.aggregate({
      where: { ...live, healthScore: { not: null } },
      _avg: { healthScore: true },
    }),
    db.website.aggregate({
      where: live,
      _sum: { openIssueCount: true, criticalIssueCount: true },
    }),
    db.website.findMany({
      where: { ...live, openIssueCount: { gt: 0 } },
      select: {
        id: true,
        url: true,
        openIssueCount: true,
        criticalIssueCount: true,
        healthScore: true,
        client: { select: { name: true } },
      },
      orderBy: [{ criticalIssueCount: "desc" }, { openIssueCount: "desc" }],
      take: 5,
    }),
  ]);

  const average = health._avg.healthScore;

  return {
    websitesTotal,
    websitesActive,
    websitesPaused,
    websitesNeverScanned,
    clientsTotal,
    averageHealthScore: average === null ? null : Math.round(average),
    openIssues: issues._sum.openIssueCount ?? 0,
    criticalIssues: issues._sum.criticalIssueCount ?? 0,
    needsAttention: needsAttention.map((site) => ({
      id: site.id,
      url: site.url,
      clientName: site.client?.name ?? null,
      openIssueCount: site.openIssueCount,
      criticalIssueCount: site.criticalIssueCount,
      healthScore: site.healthScore,
    })),
  };
}
