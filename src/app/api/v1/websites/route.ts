import { NextResponse } from "next/server";
import { repositoriesFor } from "@pdm/database/repositories";
import { forAgency } from "@pdm/database/tenant";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { validateWebsiteUrl } from "@/server/services/website-validation";
import { requireAllowedValue } from "@/server/services/entitlement-guard";
import { childLogger } from "@pdm/shared/logger";

const log = childLogger({ component: "api-v1-websites" });

/**
 * PUBLIC REST API v1 — Websites List & Create
 * Spec: dev-doc3/phases/phase-16-public-api-webhooks.md
 */

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

  const db = forAgency(auth.agencyId);
  const [websites, total] = await Promise.all([
    db.website.findMany({
      where: { agencyId: auth.agencyId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        url: true,
        label: true,
        scanFrequency: true,
        scanPriority: true,
        alertProfile: true,
        consecutiveFailures: true,
        createdAt: true,
        updatedAt: true,
        scans: {
          take: 1,
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            pagesScanned: true,
          },
        },
        healthScore: true,
        scoreConfidence: true,
        _count: {
          select: {
            issues: {
              where: { status: { in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED"] } },
            },
          },
        },
      },
    }),
    db.website.count({
      where: { agencyId: auth.agencyId, archivedAt: null },
    }),
  ]);

  const items = websites.map((w) => ({
    id: w.id,
    url: w.url,
    label: w.label,
    scanFrequency: w.scanFrequency,
    scanPriority: w.scanPriority,
    alertProfile: w.alertProfile,
    consecutiveFailures: w.consecutiveFailures,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    latestScan: w.scans[0] ?? null,
    healthScore: w.healthScore,
    scoreConfidence: w.scoreConfidence,
    activeIssuesCount: w._count.issues,
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
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
      { status: 401 },
    );
  }

  const scopeError = requireApiScope(auth, "write");
  if (scopeError) return scopeError;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "URL is required" } },
      { status: 400 },
    );
  }

  const outcome = await validateWebsiteUrl(
    { agencyId: auth.agencyId, userId: auth.keyId },
    rawUrl,
  );
  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: {
          code: outcome.result.code,
          message: outcome.result.message ?? "URL validation failed",
        },
      },
      { status: 422 },
    );
  }

  const frequency = typeof body.scanFrequency === "string" ? body.scanFrequency : "WEEKLY";
  try {
    await requireAllowedValue(auth.agencyId, "scanFrequencies", frequency);
  } catch {
    return NextResponse.json(
      { error: { code: "PLAN_LIMIT_REACHED", message: "Requested scan frequency is not allowed on current plan" } },
      { status: 403 },
    );
  }

  const { normalized } = outcome;
  const repos = repositoriesFor(auth.agencyId);

  try {
    const created = await repos.websites.create(
      {
        url: normalized.url,
        originalUrl: rawUrl,
        host: normalized.host,
        registrableDomain: normalized.registrableDomain,
        label: typeof body.label === "string" ? body.label.trim() : null,
        scanFrequency: frequency as never,
        scanPriority: typeof body.scanPriority === "string" ? (body.scanPriority as never) : "NORMAL",
        monitoredPaths: Array.isArray(body.monitoredPaths)
          ? body.monitoredPaths.filter((p): p is string => typeof p === "string")
          : ["/"],
        alertProfile:
          body.alertProfile === "CRITICAL_ONLY" || body.alertProfile === "SILENT"
            ? body.alertProfile
            : "DEFAULT",
        respectRobots: typeof body.respectRobots === "boolean" ? body.respectRobots : null,
        nextScanAt: frequency === "MANUAL" ? null : new Date(),
      },
      { userId: null },
    );

    log.info({ websiteId: created.id, agencyId: auth.agencyId }, "website created via public api");

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    log.error({ err: error, agencyId: auth.agencyId }, "failed to create website via api");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create website" } },
      { status: 500 },
    );
  }
}
