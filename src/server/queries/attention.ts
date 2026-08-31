import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { Severity } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * ATTENTION CENTER — PLAN.md §3.4 widget 2.
 *
 * "The most important component on the page. A prioritized, deduplicated list
 * of things a human should look at, ordered by a computed urgency score."
 *
 * The five sources §3.4 names:
 *   - critical issues (newest first)
 *   - new trackers detected in the last 7 days
 *   - consent regressions
 *   - failed scans (3+ consecutive failures on one site)
 *   - websites with no successful scan in more than 2× their scan interval
 *
 * ⚠️ DEDUPLICATED **BY WEBSITE**, not by row. A site with a consent regression
 * usually also has a critical issue and often a failed scan — listing all three
 * turns the one thing a human should look at into three things they have to
 * reconcile. The highest-urgency item per site wins, and the rest are counted.
 *
 * ⚠️ THE URGENCY SCORE IS EXPLICIT DATA, not an ordering trick. §4.12 makes the
 * same argument about the health score: a ranking nobody can explain is a
 * ranking nobody trusts, so the reason is carried alongside the item.
 */

export type AttentionKind =
  | "consent_regression"
  | "critical_issue"
  | "scan_failing"
  | "new_tracker"
  | "stale";

/**
 * Base urgency per kind.
 *
 * ⚠️ CONSENT REGRESSION OUTRANKS A CRITICAL ISSUE. A regression means something
 * that used to work stopped working — it is both more actionable and more
 * time-sensitive than a finding that has been true since the site was added.
 */
const BASE_URGENCY: Record<AttentionKind, number> = {
  consent_regression: 100,
  critical_issue: 80,
  scan_failing: 70,
  new_tracker: 50,
  stale: 40,
};

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  websiteId: string;
  websiteLabel: string;
  clientName: string | null;
  severity: Severity;
  /** One line, rule- or query-authored. Never AI (P1). */
  description: string;
  at: Date;
  href: string;
  urgency: number;
  /** Other items suppressed for this website by the dedupe. */
  alsoCount: number;
  /** Only these two are actionable inline (§3.4). */
  issueId: string | null;
}

const NEW_TRACKER_WINDOW_DAYS = 7;
const FAILING_THRESHOLD = 3;

const INTERVAL_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
};

function scopeFilter(websiteScope: readonly string[]) {
  // Empty scope means ALL websites, not none — the `permissions.ts` convention.
  return websiteScope.length > 0 ? { id: { in: [...websiteScope] } } : {};
}

export async function getAttentionItems(
  ctx: AgencyContext,
  limit = 8,
): Promise<{ items: AttentionItem[]; total: number; websitesMonitored: number }> {
  const { db } = repositoriesFor(ctx.agencyId);
  const now = new Date();
  const live = { archivedAt: null, ...scopeFilter(ctx.websiteScope) };
  const since7d = new Date(now.getTime() - NEW_TRACKER_WINDOW_DAYS * 86_400_000);

  const [criticalIssues, regressions, newTrackers, failing, websites] =
    await Promise.all([
      db.issue.findMany({
        where: {
          severity: "CRITICAL",
          status: { in: ["NEW", "REOPENED", "ACKNOWLEDGED"] },
          website: live,
        },
        select: {
          id: true,
          title: true,
          firstDetectedAt: true,
          websiteId: true,
          website: { select: { url: true, label: true, client: { select: { name: true } } } },
        },
        orderBy: { firstDetectedAt: "desc" },
        take: 25,
      }),
      db.privacyDriftEvent.findMany({
        where: {
          changeType: "CONSENT_REGRESSION",
          acknowledged: false,
          detectedAt: { gte: since7d },
          website: live,
        },
        select: {
          id: true,
          summary: true,
          detectedAt: true,
          websiteId: true,
          website: { select: { url: true, label: true, client: { select: { name: true } } } },
        },
        orderBy: { detectedAt: "desc" },
        take: 25,
      }),
      db.privacyDriftEvent.findMany({
        where: {
          changeType: { in: ["TRACKER_ADDED", "UNKNOWN_VENDOR_ADDED"] },
          acknowledged: false,
          detectedAt: { gte: since7d },
          website: live,
        },
        select: {
          id: true,
          summary: true,
          detectedAt: true,
          websiteId: true,
          website: { select: { url: true, label: true, client: { select: { name: true } } } },
        },
        orderBy: { detectedAt: "desc" },
        take: 25,
      }),
      db.website.findMany({
        where: { ...live, consecutiveFailures: { gte: FAILING_THRESHOLD } },
        select: {
          id: true,
          url: true,
          label: true,
          consecutiveFailures: true,
          lastScanAt: true,
          client: { select: { name: true } },
        },
        take: 25,
      }),
      // For the staleness check — cheap, and bounded by the plan's site limit.
      db.website.findMany({
        where: { ...live, monitoringStatus: "ACTIVE" },
        select: {
          id: true,
          url: true,
          label: true,
          scanFrequency: true,
          lastSuccessfulScanAt: true,
          client: { select: { name: true } },
        },
      }),
    ]);

  const label = (site: { url: string; label: string | null }) =>
    site.label ?? site.url.replace(/^https?:\/\//, "");

  const candidates: AttentionItem[] = [];

  for (const event of regressions) {
    candidates.push({
      id: `regression:${event.id}`,
      kind: "consent_regression",
      websiteId: event.websiteId,
      websiteLabel: label(event.website),
      clientName: event.website.client?.name ?? null,
      severity: "CRITICAL",
      description: event.summary,
      at: event.detectedAt,
      href: `/app/websites/${event.websiteId}/changes`,
      urgency: BASE_URGENCY.consent_regression,
      alsoCount: 0,
      issueId: null,
    });
  }

  for (const issue of criticalIssues) {
    candidates.push({
      id: `issue:${issue.id}`,
      kind: "critical_issue",
      websiteId: issue.websiteId,
      websiteLabel: label(issue.website),
      clientName: issue.website.client?.name ?? null,
      severity: "CRITICAL",
      description: issue.title,
      at: issue.firstDetectedAt,
      href: `/app/issues/${issue.id}`,
      urgency: BASE_URGENCY.critical_issue,
      alsoCount: 0,
      issueId: issue.id,
    });
  }

  for (const site of failing) {
    candidates.push({
      id: `failing:${site.id}`,
      kind: "scan_failing",
      websiteId: site.id,
      websiteLabel: label(site),
      clientName: site.client?.name ?? null,
      severity: "HIGH",
      description: `${site.consecutiveFailures} consecutive scans failed to complete`,
      at: site.lastScanAt ?? now,
      href: `/app/websites/${site.id}`,
      urgency: BASE_URGENCY.scan_failing,
      alsoCount: 0,
      issueId: null,
    });
  }

  for (const event of newTrackers) {
    candidates.push({
      id: `tracker:${event.id}`,
      kind: "new_tracker",
      websiteId: event.websiteId,
      websiteLabel: label(event.website),
      clientName: event.website.client?.name ?? null,
      severity: "HIGH",
      description: event.summary,
      at: event.detectedAt,
      href: `/app/websites/${event.websiteId}/changes`,
      urgency: BASE_URGENCY.new_tracker,
      alsoCount: 0,
      issueId: null,
    });
  }

  /*
   * ⚠️ STALENESS IS "MORE THAN TWICE THE INTERVAL", not "overdue" (§3.4). A
   * scan that ran an hour late is not worth a human's attention; one that has
   * not run in two weeks on a weekly site means the schedule has stopped.
   */
  for (const site of websites) {
    const intervalDays = INTERVAL_DAYS[site.scanFrequency];
    if (!intervalDays) continue; // MANUAL sites are never stale by definition.

    const staleAfter = intervalDays * 2 * 86_400_000;
    const last = site.lastSuccessfulScanAt;
    if (last && now.getTime() - last.getTime() < staleAfter) continue;
    // A site that has NEVER scanned is handled by onboarding, not here.
    if (!last) continue;

    candidates.push({
      id: `stale:${site.id}`,
      kind: "stale",
      websiteId: site.id,
      websiteLabel: label(site),
      clientName: site.client?.name ?? null,
      severity: "MEDIUM",
      description: `No successful scan since ${last.toISOString().slice(0, 10)}`,
      at: last,
      href: `/app/websites/${site.id}`,
      urgency: BASE_URGENCY.stale,
      alsoCount: 0,
      issueId: null,
    });
  }

  // ── Dedupe by website, keeping the most urgent ─────────────────────────
  const byWebsite = new Map<string, AttentionItem>();
  for (const candidate of candidates) {
    const existing = byWebsite.get(candidate.websiteId);
    if (!existing) {
      byWebsite.set(candidate.websiteId, candidate);
      continue;
    }
    if (
      candidate.urgency > existing.urgency ||
      (candidate.urgency === existing.urgency && candidate.at > existing.at)
    ) {
      byWebsite.set(candidate.websiteId, {
        ...candidate,
        alsoCount: existing.alsoCount + 1,
      });
    } else {
      existing.alsoCount += 1;
    }
  }

  const items = [...byWebsite.values()].sort(
    (a, b) => b.urgency - a.urgency || b.at.getTime() - a.at.getTime(),
  );

  return {
    items: items.slice(0, limit),
    total: items.length,
    websitesMonitored: websites.length,
  };
}
