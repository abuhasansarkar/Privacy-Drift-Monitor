import { NextResponse } from "next/server";
import type { IssueStatus, Severity } from "@pdm/database";
import { forAgency } from "@pdm/database/tenant";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";

/**
 * PUBLIC REST API v1 — Issues List
 *
 * PLAN.md Part XVI: "Agency-scoped endpoints (`/api/v1/websites`, `/api/v1/scans`,
 * `/api/v1/issues`)". The websites and scans endpoints shipped with Phase 16;
 * this route completes the trio named in the spec.
 *
 * Read-only, API-key authenticated, tenant-scoped twice over: `forAgency`
 * scopes the client AND the `website` relation filter repeats the agency
 * bound (same defence-in-depth shape as `scans/[id]/route.ts`).
 */

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const STATUSES = [
  "NEW",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "VERIFIED",
  "IGNORED",
  "REOPENED",
] as const;

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
      { status: 401 },
    );
  }

  const scopeError = requireApiScope(auth, "read");
  if (scopeError) return scopeError;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? 50)), 100);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const severityParam = url.searchParams.get("severity");
  if (severityParam && !SEVERITIES.includes(severityParam as (typeof SEVERITIES)[number])) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid severity. Allowed values: ${SEVERITIES.join(", ")}`,
        },
      },
      { status: 422 },
    );
  }

  const statusParam = url.searchParams.get("status");
  if (statusParam && !STATUSES.includes(statusParam as (typeof STATUSES)[number])) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid status. Allowed values: ${STATUSES.join(", ")}`,
        },
      },
      { status: 422 },
    );
  }

  const websiteIdParam = url.searchParams.get("websiteId");

  const db = forAgency(auth.agencyId);
  const where = {
    agencyId: auth.agencyId,
    website: { agencyId: auth.agencyId },
    ...(severityParam ? { severity: severityParam as Severity } : {}),
    ...(statusParam ? { status: statusParam as IssueStatus } : {}),
    ...(websiteIdParam ? { websiteId: websiteIdParam } : {}),
  };

  const [issues, total] = await Promise.all([
    db.issue.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        websiteId: true,
        ruleId: true,
        ruleVersion: true,
        category: true,
        severity: true,
        status: true,
        confidence: true,
        title: true,
        message: true,
        technicalReason: true,
        recommendedAction: true,
        firstDetectedAt: true,
        lastSeenAt: true,
        occurrenceCount: true,
        firstScanId: true,
        lastScanId: true,
        website: {
          select: {
            id: true,
            url: true,
            label: true,
          },
        },
      },
    }),
    db.issue.count({ where }),
  ]);

  return NextResponse.json({
    data: issues,
    pagination: { total, limit, offset },
  });
}
