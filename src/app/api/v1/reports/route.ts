import { NextResponse } from "next/server";
import { forAgency } from "@pdm/database/tenant";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { childLogger } from "@pdm/shared/logger";

const log = childLogger({ component: "api-v1-reports" });

/**
 * PUBLIC REST API v1 — Reports List
 * Spec: dev-doc3/phases/phase-16-public-api-webhooks.md §3 Task 16.3
 *
 * Lists generated reports for the authenticated agency.
 * Read-scoped, tenant-isolated via forAgency + agencyId filter.
 *
 * Query parameters:
 *   - websiteId?: string  — filter to one website
 *   - type?:      string  — filter by report type (SUMMARY | TECHNICAL | EXECUTIVE | COMPLIANCE | TREND)
 *   - status?:    string  — filter by status (PENDING | GENERATING | READY | FAILED)
 *   - limit?:     number  — 1–100, default 50
 *   - offset?:    number  — default 0
 */

const REPORT_TYPES = [
  "SCAN",
  "ISSUE",
  "MONTHLY_MONITORING",
  "WEBSITE_HEALTH",
  "PRIVACY_DRIFT",
] as const;
const REPORT_STATUSES = ["QUEUED", "GENERATING", "READY", "FAILED"] as const;

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

  const typeParam = url.searchParams.get("type");
  if (typeParam && !REPORT_TYPES.includes(typeParam as (typeof REPORT_TYPES)[number])) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid type. Allowed values: ${REPORT_TYPES.join(", ")}`,
        },
      },
      { status: 422 },
    );
  }

  const statusParam = url.searchParams.get("status");
  if (statusParam && !REPORT_STATUSES.includes(statusParam as (typeof REPORT_STATUSES)[number])) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid status. Allowed values: ${REPORT_STATUSES.join(", ")}`,
        },
      },
      { status: 422 },
    );
  }

  const websiteIdParam = url.searchParams.get("websiteId");

  const db = forAgency(auth.agencyId);

  const where = {
    agencyId: auth.agencyId,
    deletedAt: null,
    ...(typeParam ? { type: typeParam as (typeof REPORT_TYPES)[number] } : {}),
    ...(statusParam ? { status: statusParam as (typeof REPORT_STATUSES)[number] } : {}),
    ...(websiteIdParam ? { websiteId: websiteIdParam } : {}),
  };

  try {
    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          websiteId: true,
          agencyId: true,
          type: true,
          status: true,
          name: true,
          pageCount: true,
          sizeBytes: true,
          generatedAt: true,
          createdAt: true,
          website: {
            select: {
              id: true,
              url: true,
              label: true,
            },
          },
        },
      }),
      db.report.count({ where }),
    ]);

    const items = reports.map((r) => ({
      id: r.id,
      websiteId: r.websiteId,
      agencyId: r.agencyId,
      type: r.type,
      status: r.status,
      name: r.name,
      pageCount: r.pageCount,
      sizeBytes: r.sizeBytes,
      generatedAt: r.generatedAt,
      createdAt: r.createdAt,
      website: r.website,
      // Download URL is provided separately via /api/v1/reports/[id]/download
      downloadUrl: r.status === "READY"
        ? `/api/v1/reports/${r.id}/download`
        : null,
    }));

    return NextResponse.json({
      data: items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    });
  } catch (error) {
    log.error({ err: error, agencyId: auth.agencyId }, "failed to list reports via public api");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to list reports" } },
      { status: 500 },
    );
  }
}
