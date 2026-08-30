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
 * ⚠️ EVERY COUNT ON THIS PAGE IS A REAL QUERY. Nothing is derived from a
 * placeholder or a plausible default: a dashboard number the reader cannot
 * trace to a scan is the fastest way to lose trust in every other number
 * (P1). Where a value does not exist yet — an unscanned site's health — the
 * type is nullable and the UI renders "—", never 0.
 */

/** Rolling windows the tiles report on. */
const DRIFT_WINDOW_DAYS = 7;
const NEW_ISSUE_WINDOW_HOURS = 24;
const TREND_DAYS = 30;

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
  /** Sites whose latest scan scored in the healthy band. */
  websitesHealthy: number;
  websitesWarning: number;
  websitesCritical: number;
  scansToday: number;
  newIssues24h: number;
  driftEvents7d: number;
  needsAttention: NeedsAttentionRow[];
  driftSummary: DriftSummaryRow[];
  /** One point per day with at least one scored scan. Sparse by design. */
  healthTrend: TrendPoint[];
}

export interface DriftSummaryRow {
  changeType: string;
  count: number;
}

export interface TrendPoint {
  day: string;
  score: number;
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

  // Window boundaries captured ONCE. Computing them per query would let two
  // counts on the same page describe slightly different periods.
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const since24h = new Date(now.getTime() - NEW_ISSUE_WINDOW_HOURS * 3600_000);
  const since7d = new Date(now.getTime() - DRIFT_WINDOW_DAYS * 86_400_000);
  const sinceTrend = new Date(now.getTime() - TREND_DAYS * 86_400_000);

  const [
    websitesTotal,
    websitesActive,
    websitesPaused,
    websitesNeverScanned,
    clientsTotal,
    health,
    issues,
    needsAttention,
    websitesHealthy,
    websitesWarning,
    websitesCritical,
    scansToday,
    newIssues24h,
    driftGroups,
    trendScans,
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
    // Band boundaries match §11.3 exactly — the same numbers `bandFor()` uses,
    // so a tile and a score pill can never disagree about what "healthy" means.
    db.website.count({ where: { ...live, healthScore: { gte: 75 } } }),
    db.website.count({ where: { ...live, healthScore: { gte: 50, lt: 75 } } }),
    db.website.count({ where: { ...live, healthScore: { lt: 50 } } }),
    db.scan.count({ where: { createdAt: { gte: startOfToday } } }),
    db.issue.count({
      where: {
        firstDetectedAt: { gte: since24h },
        status: { notIn: ["IGNORED"] },
      },
    }),
    db.privacyDriftEvent.groupBy({
      by: ["changeType"],
      where: { detectedAt: { gte: since7d } },
      _count: { _all: true },
    }),
    // The trend line. Only SCORED scans — an unscored scan has no point to
    // plot, and interpolating one would be inventing a measurement.
    db.scan.findMany({
      where: { finishedAt: { gte: sinceTrend }, healthScore: { not: null } },
      select: { finishedAt: true, healthScore: true },
      orderBy: { finishedAt: "asc" },
    }),
  ]);

  const average = health._avg.healthScore;

  /*
   * One point per DAY, averaged across every website scanned that day. A raw
   * per-scan series would zig-zag between a healthy site and a poor one and
   * show a portfolio trend that does not exist.
   */
  const byDay = new Map<string, { total: number; count: number }>();
  for (const scan of trendScans) {
    if (!scan.finishedAt || scan.healthScore === null) continue;
    const day = scan.finishedAt.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { total: 0, count: 0 };
    entry.total += scan.healthScore;
    entry.count += 1;
    byDay.set(day, entry);
  }

  return {
    websitesHealthy,
    websitesWarning,
    websitesCritical,
    scansToday,
    newIssues24h,
    driftEvents7d: driftGroups.reduce((total, group) => total + group._count._all, 0),
    driftSummary: driftGroups
      .map((group) => ({ changeType: group.changeType, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    healthTrend: [...byDay.entries()]
      .map(([day, entry]) => ({ day, score: Math.round(entry.total / entry.count) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
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
