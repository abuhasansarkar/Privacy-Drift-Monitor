import { repositoriesFor } from "@pdm/database/repositories";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getEvidence, parseEvidenceFilters } from "@/server/queries/evidence";

/**
 * EVIDENCE EXPORT — §3.8 ("Export as JSON/CSV, permission-gated, audit-logged").
 *
 * ⚠️ `evidence:export` IS ITS OWN PERMISSION, and this is the only route that
 * requires it. Looking at a client's recording inside the product and lifting
 * it out as a file are different decisions: the file leaves our retention
 * policy, our access controls and our audit trail behind.
 *
 * ⚠️ AUDIT-LOGGED BEFORE THE BYTES ARE RETURNED. §10.2 lists evidence export
 * among the actions most likely to be questioned later; writing the row after
 * a successful response would lose exactly the exports that failed halfway.
 *
 * ⚠️ CAPPED. An export is a working artefact, not a database dump — the cap
 * keeps one request from materialising a scan's entire recording in memory.
 */

const MAX_ROWS = 5_000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Formula injection guard — a URL beginning `=` is user-controlled input.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/websites/[websiteId]/evidence/export">,
) {
  const { websiteId } = await context.params;
  const ctx = await requireWebsiteAccess(websiteId, "evidence:export");

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const filters = parseEvidenceFilters(raw);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  const { selected, rows } = await getEvidence(ctx, websiteId, {
    ...filters,
    page: 1,
  });

  if (!selected || !rows) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "We couldn't find that scan." } },
      { status: 404 },
    );
  }

  // Re-read with the export cap rather than the page size.
  const repos = repositoriesFor(ctx.agencyId);
  const items = await collect(repos, selected.id, filters);

  await repos.audit.record({
    action: "evidence.exported",
    entityType: "scan",
    entityId: selected.id,
    userId: ctx.userId,
    after: { kind: filters.kind, format, rows: items.length, websiteId },
  });

  const stamp = (selected.finishedAt ?? selected.createdAt).toISOString().slice(0, 10);
  const filename = `evidence-${filters.kind}-${stamp}`;

  if (format === "json") {
    return new Response(
      JSON.stringify(
        {
          scanId: selected.id,
          websiteId,
          kind: filters.kind,
          exportedAt: new Date().toISOString(),
          /*
           * Stated in the file itself, because an export outlives the page it
           * came from and whoever opens it will not have read §10.6.
           */
          note:
            "Query values, cookie values and header values are stripped before storage. " +
            "This export contains everything that was kept.",
          rows: items,
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.json"`,
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const columns = items.length > 0 ? Object.keys(items[0] as object) : [];
  const lines = [columns.join(",")];
  for (const item of items) {
    lines.push(
      columns.map((column) => csvCell((item as Record<string, unknown>)[column])).join(","),
    );
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

async function collect(
  repos: ReturnType<typeof repositoriesFor>,
  scanId: string,
  filters: ReturnType<typeof parseEvidenceFilters>,
): Promise<unknown[]> {
  const paging = { skip: 0, take: MAX_ROWS };

  switch (filters.kind) {
    case "cookies":
      return (await repos.scans.evidenceCookies(scanId, paging)).items;
    case "storage":
      return (await repos.scans.evidenceStorage(scanId, paging)).items;
    case "console":
      return (await repos.scans.evidenceConsole(scanId, paging)).items;
    case "screenshots":
      return repos.scans.evidenceScreenshots(scanId);
    default:
      return (
        await repos.scans.evidenceRequests(scanId, {
          ...paging,
          search: filters.search,
          consentPhase: filters.consentPhase,
          resourceType: filters.resourceType,
          thirdPartyOnly: filters.thirdPartyOnly,
          trackerOnly: filters.trackerOnly,
        })
      ).items;
  }
}
