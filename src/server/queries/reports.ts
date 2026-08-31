import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { report as reportSchemas } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * REPORT QUERIES — §3.11 (`/app/reports`).
 *
 * ⚠️ NO SIGNED URL IS ISSUED HERE. §10.7: a signed URL is generated per request
 * and never stored or embedded in a list payload — a list of twenty reports
 * would otherwise hand the browser twenty live download links, each valid long
 * after the page was closed. `/api/reports/[reportId]/download` mints one, per
 * click, after re-asserting the tenant.
 */

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

export async function getReportList(
  ctx: AgencyContext,
  raw: Record<string, string | string[] | undefined>,
) {
  const parsed = reportSchemas.reportListQuerySchema.safeParse({
    type: first(raw.type),
    status: first(raw.status),
    clientId: first(raw.client),
    websiteId: first(raw.website),
    search: first(raw.search),
    page: first(raw.page),
    perPage: first(raw.perPage),
  });

  const query = parsed.success
    ? parsed.data
    : reportSchemas.reportListQuerySchema.parse({});

  const repos = repositoriesFor(ctx.agencyId);
  return { query, page: await repos.reports.list(query) };
}

export async function getReportDetail(ctx: AgencyContext, reportId: string) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.reports.findById(reportId);
}

/** Everything the generation wizard needs to populate its selectors. */
export async function getReportWizardOptions(ctx: AgencyContext) {
  const repos = repositoriesFor(ctx.agencyId);
  const [clients, websites] = await Promise.all([
    repos.db.client.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    repos.db.website.findMany({
      where: { archivedAt: null },
      select: { id: true, url: true, label: true, clientId: true },
      orderBy: { url: "asc" },
    }),
  ]);
  return { clients, websites };
}

/** The most recent scans of one website, for a SCAN report's selector. */
export async function getScanChoices(ctx: AgencyContext, websiteId: string) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.db.scan.findMany({
    where: { websiteId, status: { in: ["COMPLETED", "PARTIAL"] } },
    select: { id: true, status: true, finishedAt: true, healthScore: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
