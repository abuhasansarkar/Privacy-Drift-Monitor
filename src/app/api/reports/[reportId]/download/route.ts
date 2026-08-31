import { NextResponse } from "next/server";
import { repositoriesFor } from "@pdm/database/repositories";
import { objectStore } from "@pdm/storage";
import { requirePermission } from "@/server/auth/context";

/**
 * REPORT DOWNLOAD — PLAN.md §6.8, §10.7.
 *
 * ⚠️ THE SIGNED URL IS MINTED PER REQUEST, AFTER RE-ASSERTING THE TENANT, and
 * is never stored or embedded in a page (§10.7). The report list renders a link
 * to THIS route, not to S3 — so the page's HTML carries no credential, and a
 * revoked member's cached page yields a 404 rather than a working download.
 *
 * ⚠️ `repositoriesFor(ctx.agencyId)` DOES THE AUTHORISATION. A report id from
 * another agency simply does not match, and comes back as 404 — never 403,
 * which would confirm the id exists (§6.2).
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/reports/[reportId]/download">,
) {
  const ctx = await requirePermission("report:read");
  const { reportId } = await context.params;

  const repos = repositoriesFor(ctx.agencyId);
  const report = await repos.reports.findById(reportId);

  if (!report || report.status !== "READY" || !report.s3Key) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "We couldn't find that report." } },
      { status: 404 },
    );
  }

  const inline =
    new URL(request.url).searchParams.get("disposition") === "inline";

  const url = await objectStore().signedUrl(report.s3Key, inline ? 300 : 900);

  // Counted after the URL is issued, so a storage failure is not recorded as a
  // download the agency then cannot find.
  await repos.reports.recordDownload(report.id, new Date());

  await repos.audit.record({
    action: "report.generated",
    entityType: "report",
    entityId: report.id,
    userId: ctx.userId,
    after: { downloaded: true, inline },
  });

  /*
   * A 302 to the signed URL rather than proxying the bytes: a 4 MB PDF through
   * the Node process holds a request for the length of the transfer, and S3
   * does range requests and resumes that we would have to reimplement.
   */
  return NextResponse.redirect(url, { status: 302 });
}
