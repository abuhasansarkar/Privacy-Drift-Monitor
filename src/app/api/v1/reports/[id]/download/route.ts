import { NextResponse } from "next/server";
import { repositoriesFor } from "@pdm/database/repositories";
import { objectStore } from "@pdm/storage";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";

/**
 * Report download endpoint via public API v1.
 * Supports both JSON response with signed URL and HTTP 302 redirect.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
      { status: 401 },
    );
  }

  const scopeError = requireApiScope(auth, "read");
  if (scopeError) return scopeError;

  const { id: reportId } = await context.params;
  const repos = repositoriesFor(auth.agencyId);

  const report = await repos.reports.findById(reportId);
  if (!report || report.status !== "READY" || !report.s3Key) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or not ready" } },
      { status: 404 },
    );
  }

  const url = await objectStore().signedUrl(report.s3Key, 900);
  await repos.reports.recordDownload(report.id, new Date());

  const reqUrl = new URL(request.url);
  const wantsJson =
    reqUrl.searchParams.get("json") === "true" ||
    request.headers.get("accept")?.includes("application/json");

  if (wantsJson) {
    return NextResponse.json({
      data: {
        reportId: report.id,
        websiteId: report.websiteId,
        type: report.type,
        format: "pdf",
        downloadUrl: url,
        expiresInSeconds: 900,
      },
    });
  }

  return NextResponse.redirect(url, { status: 302 });
}
