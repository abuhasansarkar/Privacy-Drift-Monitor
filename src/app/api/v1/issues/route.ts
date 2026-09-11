import { NextResponse } from "next/server";
import { z } from "zod";
import type { IssueStatus, Severity } from "@pdm/database";
import { forAgency } from "@pdm/database/tenant";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { enforceApiRateLimit } from "@/server/services/api-rate-limit";
import { withApiErrors } from "../_lib/with-errors";

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

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

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

async function handleGET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
      { status: 401 },
    );
  }

  const scopeError = requireApiScope(auth, "read");
  if (scopeError) return scopeError;

  await enforceApiRateLimit(auth.keyId);
  const url = new URL(request.url);
  const { limit, offset } = paginationQuerySchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

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

export const GET = withApiErrors(handleGET);

