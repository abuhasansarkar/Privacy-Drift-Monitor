import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { AgencyContext } from "@/server/auth/context";

/**
 * WEBSITE DETAIL TAB QUERIES — §3.6, Phase 3 task 3.10.
 *
 * ⚠️ EVERY TAB READS THE LATEST SCAN, and says which one. A tab that silently
 * mixed rows from several scans would show a tracker that was removed last week
 * beside one detected this morning, with no way to tell them apart. The scan is
 * the unit of observation; the tabs are views onto one.
 *
 * ⚠️ A website with no completed scan returns `scan: null`, and every tab
 * renders "not scanned yet" rather than an empty table. An empty table reads as
 * "we looked and found nothing" (P1).
 */

/** The scan every tab reports on: the most recent one that produced evidence. */
async function latestScan(ctx: AgencyContext, websiteId: string) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.db.scan.findFirst({
    where: { websiteId, status: { in: ["COMPLETED", "PARTIAL"] } },
    orderBy: { finishedAt: "desc" },
    include: { phases: { orderBy: { phase: "asc" } } },
  });
}

export async function getTrackersTab(ctx: AgencyContext, websiteId: string) {
  const scan = await latestScan(ctx, websiteId);
  if (!scan) return { scan: null, detections: [] };

  const repos = repositoriesFor(ctx.agencyId);
  const detections = await repos.db.trackerDetection.findMany({
    where: { scanId: scan.id },
    include: {
      vendor: {
        select: { id: true, name: true, category: true, riskLevel: true, slug: true },
      },
    },
    // Pre-consent first: that is the finding a reader is looking for, and
    // burying it under alphabetical order makes them hunt.
    orderBy: [{ consentPhase: "asc" }, { requestCount: "desc" }],
  });

  return { scan, detections };
}

export async function getCookiesTab(
  ctx: AgencyContext,
  websiteId: string,
  phase: string,
) {
  const scan = await latestScan(ctx, websiteId);
  if (!scan) return { scan: null, cookies: [], counts: {} as Record<string, number> };

  const repos = repositoriesFor(ctx.agencyId);
  const [cookies, groups] = await Promise.all([
    repos.db.cookieRecord.findMany({
      // `phase_end` only: the other snapshot points exist so the DIFFERENCE
      // between them can be computed, but showing four snapshots of the same
      // cookie in one table is noise, not detail (§4.5).
      where: { scanId: scan.id, consentPhase: phase as never, snapshotPoint: "phase_end" },
      orderBy: [{ isThirdParty: "desc" }, { name: "asc" }],
    }),
    repos.db.cookieRecord.groupBy({
      by: ["consentPhase"],
      where: { scanId: scan.id, snapshotPoint: "phase_end" },
      _count: { _all: true },
    }),
  ]);

  return {
    scan,
    cookies,
    counts: Object.fromEntries(
      groups.map((group) => [group.consentPhase, group._count._all]),
    ),
  };
}

export async function getConsentTab(ctx: AgencyContext, websiteId: string) {
  const scan = await latestScan(ctx, websiteId);
  if (!scan) return { scan: null, counts: {} as Record<string, number> };

  const repos = repositoriesFor(ctx.agencyId);
  // Third-party request counts per phase — the number each phase card reports.
  const groups = await repos.db.networkRequest.groupBy({
    by: ["consentPhase"],
    where: { scanId: scan.id, isThirdParty: true },
    _count: { _all: true },
  });

  return {
    scan,
    counts: Object.fromEntries(
      groups.map((group) => [group.consentPhase, group._count._all]),
    ),
  };
}

export async function getChangesTab(ctx: AgencyContext, websiteId: string) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.db.privacyDriftEvent.findMany({
    where: { websiteId },
    orderBy: { detectedAt: "desc" },
    take: 100,
  });
}
