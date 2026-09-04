import { NextResponse } from "next/server";
import { repositoriesFor } from "@pdm/database/repositories";
import { forAgency } from "@pdm/database/tenant";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { childLogger } from "@pdm/shared/logger";

const log = childLogger({ component: "api-v1-website-detail" });

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

  const { id } = await context.params;
  const db = forAgency(auth.agencyId);

  const website = await db.website.findFirst({
    where: { id, agencyId: auth.agencyId, archivedAt: null },
    include: {
      scans: {
        take: 5,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          pagesScanned: true,
          errorCode: true,
        },
      },
      _count: {
        select: {
          issues: {
            where: { status: { in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED"] } },
          },
        },
      },
    },
  });

  if (!website) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Website not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      id: website.id,
      url: website.url,
      label: website.label,
      host: website.host,
      registrableDomain: website.registrableDomain,
      scanFrequency: website.scanFrequency,
      scanPriority: website.scanPriority,
      alertProfile: website.alertProfile,
      monitoredPaths: website.monitoredPaths,
      consecutiveFailures: website.consecutiveFailures,
      createdAt: website.createdAt,
      updatedAt: website.updatedAt,
      recentScans: website.scans,
      healthScore: website.healthScore,
      scoreConfidence: website.scoreConfidence,
      activeIssuesCount: website._count.issues,
    },
  });
}

export async function DELETE(
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

  const scopeError = requireApiScope(auth, "write");
  if (scopeError) return scopeError;

  const { id } = await context.params;
  const repos = repositoriesFor(auth.agencyId);

  const website = await repos.websites.findById(id);
  if (!website) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Website not found" } },
      { status: 404 },
    );
  }

  await repos.websites.archive(id, { userId: null });
  log.info({ websiteId: id, agencyId: auth.agencyId }, "website archived via public api");

  return NextResponse.json({ success: true, message: "Website archived successfully" });
}
