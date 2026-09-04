import { websiteSchemas } from "./schema";
import { repositoriesFor } from "@pdm/database/repositories";
import { FREQUENCY_LABEL, MONITORING_LABEL } from "@pdm/shared/copy/labels";
import { requirePermission } from "@/server/auth/context";
import { withApiErrors } from "../../_lib/with-errors";

/**
 * WEBSITE CSV EXPORT — §3.5 ("Entry points: Add Website · Import CSV · Export
 * CSV", `GET /api/websites/export`).
 *
 * ⚠️ THE EXPORT IS THE IMPORT'S MIRROR. The column order matches what
 * `/app/websites/import` accepts, so an agency can export, edit in a
 * spreadsheet and re-import. Diverging the two would make round-tripping a
 * manual remapping job.
 *
 * ⚠️ MEMBER WEBSITE SCOPE IS APPLIED (§6.2). A developer restricted to three
 * sites exports three rows — an export route that skipped the scope would be a
 * one-request way around the restriction.
 */

const COLUMNS = [
  "url",
  "label",
  "client",
  "group",
  "frequency",
  "status",
  "health_score",
  "open_issues",
  "critical_issues",
  "trackers",
  "last_scan",
  "next_scan",
] as const;

/**
 * ⚠️ Guards against CSV injection — a leading `=`, `+`, `-` or `@` is treated
 * as a formula by Excel and Sheets. A website label is user-controlled, so
 * every field goes through this, not just the ones that look risky.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

async function handleGET(request: Request) {
  const ctx = await requirePermission("website:read");
  const repos = repositoriesFor(ctx.agencyId);

  const params = new URL(request.url).searchParams;
  const parsed = websiteSchemas.parse({
    search: params.get("search") ?? undefined,
    clientId: params.get("client") ?? undefined,
    groupId: params.get("group") ?? undefined,
    status: params.get("status") ?? undefined,
  });

  // Bounded rather than streamed: the set is capped by the plan's website
  // limit, so the largest export is a few hundred rows. The audit log needs
  // streaming; this does not.
  const page = await repos.websites.list({
    ...parsed,
    includeArchived: false,
    sort: "url",
    direction: "asc",
    page: 1,
    perPage: 1000,
    websiteScope: ctx.websiteScope,
  });

  const lines = [COLUMNS.join(",")];
  for (const site of page.items) {
    lines.push(
      [
        csvCell(site.url),
        csvCell(site.label),
        csvCell(site.client?.name),
        csvCell(site.group?.name),
        csvCell(FREQUENCY_LABEL[site.scanFrequency]),
        csvCell(MONITORING_LABEL[site.monitoringStatus]),
        csvCell(site.healthScore),
        csvCell(site.openIssueCount),
        csvCell(site.criticalIssueCount),
        csvCell(site.trackerCount),
        csvCell(site.lastScanAt?.toISOString()),
        csvCell(site.nextScanAt?.toISOString()),
      ].join(","),
    );
  }

  await repos.audit.record({
    action: "evidence.exported",
    entityType: "website",
    entityId: ctx.agencyId,
    userId: ctx.userId,
    after: { rows: page.items.length, format: "csv" },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="websites-${stamp}.csv"`,
      // Tenant data snapshot — nothing between us and the browser keeps a copy.
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withApiErrors(handleGET);
