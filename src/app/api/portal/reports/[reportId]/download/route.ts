import { NextResponse } from "next/server";
import { objectStore } from "@pdm/storage";
import { getPortalReportForDownload } from "@/server/portal/serializers";
import { auditPortal, getPortalSession } from "@/server/portal/session";

/**
 * PORTAL REPORT DOWNLOAD — §6.10, §10.7.
 *
 * ⚠️ SCOPED BY BOTH `agencyId` AND `clientId` FROM THE SESSION. A report id
 * from the same agency but a DIFFERENT client must not resolve — "other
 * clients' anything" is on the never-exposed list (§3.13), and a tenant-only
 * check would let one client of an agency read another's report by id.
 *
 * ⚠️ 404, NEVER 403. A 403 confirms the id exists.
 *
 * ⚠️ AUDIT-LOGGED with `actorType: 'portal_user'` (§6.10) — the agency sees
 * that their client downloaded it, which is half the value of the portal.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/portal/reports/[reportId]/download">,
) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "PORTAL_AUTH_FAILED", message: "Please sign in to continue." } },
      { status: 401 },
    );
  }

  const { reportId } = await context.params;
  const report = await getPortalReportForDownload(session, reportId);

  if (!report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "We couldn't find that report." } },
      { status: 404 },
    );
  }

  const url = await objectStore().signedUrl(report.s3Key, 300);

  await auditPortal(session, "portal.report_downloaded", {
    entityType: "report",
    entityId: report.id,
  });

  return NextResponse.redirect(url, { status: 302 });
}
