import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { AgencyContext } from "@/server/auth/context";

/**
 * DETAIL QUERIES — §3.6 (website detail), §3.7 (client detail).
 *
 * Reads go through `repositoriesFor(ctx.agencyId)`, so every query below is
 * tenant-scoped by the extension rather than by a `where` the caller has to
 * remember. A row belonging to another agency comes back as `null`, which the
 * pages render as a 404 — never a 403, because a 403 would confirm the id
 * exists somewhere the caller cannot see (§6.2).
 */

export async function getWebsiteDetail(ctx: AgencyContext, websiteId: string) {
  const repos = repositoriesFor(ctx.agencyId);

  return repos.db.website.findUnique({
    where: { id: websiteId },
    include: {
      client: { select: { id: true, name: true } },
      group: { select: { id: true, name: true, color: true } },
    },
  });
}

export type WebsiteDetail = NonNullable<Awaited<ReturnType<typeof getWebsiteDetail>>>;

export interface WebsiteTrendPoint {
  day: string;
  score: number;
}

export async function getWebsiteHealthTrend(
  ctx: AgencyContext,
  websiteId: string,
): Promise<WebsiteTrendPoint[]> {
  const repos = repositoriesFor(ctx.agencyId);
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const scans = await repos.db.scan.findMany({
    where: {
      websiteId,
      agencyId: ctx.agencyId,
      finishedAt: { gte: since30d },
      healthScore: { not: null },
    },
    select: { finishedAt: true, healthScore: true },
    orderBy: { finishedAt: "asc" },
  });

  const byDay = new Map<string, { total: number; count: number }>();
  for (const scan of scans) {
    if (!scan.finishedAt || scan.healthScore === null) continue;
    const day = scan.finishedAt.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { total: 0, count: 0 };
    entry.total += scan.healthScore;
    entry.count += 1;
    byDay.set(day, entry);
  }

  return Array.from(byDay.entries()).map(([day, { total, count }]) => ({
    day,
    score: Math.round(total / count),
  }));
}

export async function getWebsiteRecentScans(
  ctx: AgencyContext,
  websiteId: string,
  limit = 5,
) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.db.scan.findMany({
    where: { websiteId, agencyId: ctx.agencyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      trigger: true,
      startedAt: true,
      finishedAt: true,
      requestCount: true,
      healthScore: true,
    },
  });
}

export async function getWebsiteTopIssues(
  ctx: AgencyContext,
  websiteId: string,
  limit = 5,
) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.db.issue.findMany({
    where: {
      websiteId,
      agencyId: ctx.agencyId,
      status: { notIn: ["RESOLVED", "VERIFIED", "IGNORED"] },
    },
    orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      category: true,
      ruleId: true,
      lastSeenAt: true,
      occurrenceCount: true,
    },
  });
}

export async function getClientDetail(ctx: AgencyContext, clientId: string) {
  const repos = repositoriesFor(ctx.agencyId);

  // `withWebsites` already orders by url and excludes archived sites, which is
  // the ordering the detail page's Websites tab wants.
  return repos.clients.withWebsites(clientId);
}

export type ClientDetail = NonNullable<Awaited<ReturnType<typeof getClientDetail>>>;

