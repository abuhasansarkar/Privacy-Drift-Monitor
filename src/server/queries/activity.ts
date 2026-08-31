import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { AgencyContext } from "@/server/auth/context";

/**
 * RECENT ACTIVITY — PLAN.md §3.4 widget 6.
 *
 * "Reverse-chronological feed: scan completed, issue created, issue resolved,
 * website added, report generated, member joined."
 *
 * ⚠️ BUILT FROM THE AUDIT LOG, not from a second activity table. The audit log
 * already records every mutating operation (§10.2) with who did it; a parallel
 * feed table would be a second version of the same truth that drifts from it —
 * and the first time they disagreed, neither would be trustworthy.
 *
 * ⚠️ SCAN COMPLETIONS ARE THE ONE EXCEPTION. A scheduled scan has no actor and
 * writes no audit row (it is not a user action), so it is read from the scan
 * table and merged. Without it the feed would be silent on a portfolio that is
 * working perfectly, which is the opposite of reassuring.
 */

export type ActivityKind =
  | "scan_completed"
  | "scan_partial"
  | "scan_failed"
  | "issue_resolved"
  | "issue_ignored"
  | "website_added"
  | "report_generated"
  | "member_joined"
  | "other";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** One line. Composed from data, never free text a user typed. */
  summary: string;
  detail: string | null;
  actor: string | null;
  at: Date;
  href: string | null;
}

/** Audit actions worth surfacing. Everything else is noise in a dashboard feed. */
const AUDIT_KINDS: Record<string, ActivityKind> = {
  "website.created": "website_added",
  "issue.status_changed": "issue_resolved",
  "issue.ignored": "issue_ignored",
  "report.generated": "report_generated",
  "member.invited": "member_joined",
};

export async function getRecentActivity(
  ctx: AgencyContext,
  limit = 12,
): Promise<ActivityItem[]> {
  const { db, audit } = repositoriesFor(ctx.agencyId);

  const [entries, scans] = await Promise.all([
    // Over-fetched, because the filter below drops most rows and a page of
    // pure `website.updated` would otherwise come back empty.
    audit.list({ limit: limit * 4 }),
    db.scan.findMany({
      where: { status: { in: ["COMPLETED", "PARTIAL", "FAILED"] } },
      select: {
        id: true,
        status: true,
        healthScore: true,
        finishedAt: true,
        createdAt: true,
        websiteId: true,
        website: { select: { url: true, label: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const items: ActivityItem[] = [];

  for (const entry of entries.items) {
    const kind = AUDIT_KINDS[entry.action];
    if (!kind) continue;

    const actor = entry.user
      ? [entry.user.firstName, entry.user.lastName].filter(Boolean).join(" ") ||
        entry.user.email
      : null;

    items.push({
      id: `audit:${entry.id}`,
      kind,
      summary: entry.action.replace(/[._]/g, " "),
      detail: entry.entityType,
      actor,
      at: entry.createdAt,
      href: hrefFor(entry.entityType, entry.entityId),
    });
  }

  for (const scan of scans) {
    const label = scan.website.label ?? scan.website.url.replace(/^https?:\/\//, "");
    items.push({
      id: `scan:${scan.id}`,
      kind:
        scan.status === "COMPLETED"
          ? "scan_completed"
          : scan.status === "PARTIAL"
            ? "scan_partial"
            : "scan_failed",
      summary: label,
      /*
       * ⚠️ A PARTIAL SCAN NEVER SHOWS A SCORE HERE (P5). The number exists on
       * the row, and printing it next to "partially checked" is exactly the
       * clean verdict an incomplete scan may not produce.
       */
      detail:
        scan.status === "COMPLETED" && scan.healthScore !== null
          ? `Score ${scan.healthScore}`
          : null,
      actor: null,
      at: scan.finishedAt ?? scan.createdAt,
      href: `/app/websites/${scan.websiteId}/scans/${scan.id}`,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

function hrefFor(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "website":
      return `/app/websites/${entityId}`;
    case "issue":
      return `/app/issues/${entityId}`;
    case "report":
      return `/app/reports/${entityId}`;
    case "client":
      return `/app/clients/${entityId}`;
    default:
      // A comma-joined bulk id list, or an entity with no page. Not a link.
      return null;
  }
}
