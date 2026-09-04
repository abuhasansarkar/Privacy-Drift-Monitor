import { NextResponse } from "next/server";
import { repositoriesFor } from "@pdm/database/repositories";
import { objectStore } from "@pdm/storage";
import { toAppError } from "@pdm/shared/errors";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { requirePermission } from "@/server/auth/context";

/**
 * REPORT DOWNLOAD — PLAN.md §6.8, §10.7.
 *
 * ⚠️ ONE PATH, TWO CREDENTIALS, AND THAT IS DELIBERATE. Consolidating the two
 * API roots put the agency UI's `GET /api/reports/[id]/download` and the
 * customer-facing `GET /api/v1/reports/[id]/download` on the same path AND the
 * same method — the only true collision in the move. They are not layered:
 * an API key is tried first, a Clerk session second, and whichever answers
 * supplies the `agencyId`. Neither check is skipped because the other exists.
 *
 * ⚠️ THE SIGNED URL IS MINTED PER REQUEST, AFTER RE-ASSERTING THE TENANT, and
 * is never stored or embedded in a page (§10.7). The report list renders a link
 * to THIS route, not to S3 — so the page's HTML carries no credential, and a
 * revoked member's cached page yields a 404 rather than a working download.
 *
 * ⚠️ `repositoriesFor(agencyId)` DOES THE AUTHORISATION. A report id from
 * another agency simply does not match, and comes back as 404 — never 403,
 * which would confirm the id exists (§6.2).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportId } = await context.params;
    const reqUrl = new URL(request.url);

    /*
     * An API key is checked first because it is explicit: a caller that sent a
     * Bearer token meant to use it, and falling through to the session on a
     * bad key would answer a revoked key with someone else's cookie.
     */
    const apiAuth = await authenticateApiKey(request);

    let agencyId: string;
    let auditUserId: string | null = null;

    if (apiAuth) {
      const scopeError = requireApiScope(apiAuth, "read");
      if (scopeError) return scopeError;
      agencyId = apiAuth.agencyId;
    } else if (request.headers.get("authorization")) {
      // A Bearer header that `authenticateApiKey` rejected is a bad key, not an
      // invitation to try the session cookie next.
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
        { status: 401 },
      );
    } else {
      const ctx = await requirePermission("report:read");
      agencyId = ctx.agencyId;
      auditUserId = ctx.userId;
    }

    const repos = repositoriesFor(agencyId);
    const report = await repos.reports.findById(reportId);

    if (!report || report.status !== "READY" || !report.s3Key) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "We couldn't find that report." } },
        { status: 404 },
      );
    }

    // The viewer embeds the PDF rather than downloading it, and a shorter-lived
    // URL is cheaper to leak from a rendered page than a full-length one.
    const inline = reqUrl.searchParams.get("disposition") === "inline";
    const expiresInSeconds = inline ? 300 : 900;
    const url = await objectStore().signedUrl(report.s3Key, expiresInSeconds);

    // Counted after the URL is issued, so a storage failure is not recorded as a
    // download the agency then cannot find.
    await repos.reports.recordDownload(report.id, new Date());

    if (auditUserId) {
      await repos.audit.record({
        action: "report.generated",
        entityType: "report",
        entityId: report.id,
        userId: auditUserId,
        after: { downloaded: true, inline },
      });
    }

    /*
     * JSON is for API-key callers, which want the URL rather than a redirect
     * their HTTP client would follow into S3. `?json=true` forces it either way;
     * content negotiation applies ONLY to key callers, so the UI's `<a href>`
     * and `<iframe src>` keep getting the 302 they already got.
     */
    const wantsJson =
      reqUrl.searchParams.get("json") === "true" ||
      (apiAuth !== null && (request.headers.get("accept")?.includes("application/json") ?? false));

    if (wantsJson) {
      return NextResponse.json({
        data: {
          reportId: report.id,
          websiteId: report.websiteId,
          type: report.type,
          format: "pdf",
          downloadUrl: url,
          expiresInSeconds,
        },
      });
    }

    /*
     * A 302 to the signed URL rather than proxying the bytes: a 4 MB PDF through
     * the Node process holds a request for the length of the transfer, and S3
     * does range requests and resumes that we would have to reimplement.
     */
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(
      { error: { code: appError.code, message: appError.expose ? appError.message : undefined } },
      { status: appError.httpStatus },
    );
  }
}
