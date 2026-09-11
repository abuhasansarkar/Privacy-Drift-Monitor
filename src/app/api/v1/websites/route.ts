import { NextResponse } from "next/server";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { forAgency } from "@pdm/database/tenant";
import { website as websiteSchemas } from "@pdm/schemas";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import {
  enforceApiRateLimit,
  enforceApiWriteRateLimit,
} from "@/server/services/api-rate-limit";
import { validateWebsiteUrl } from "@/server/services/website-validation";
import { requireAllowedValue } from "@/server/services/entitlement-guard";
import { getEntitlements } from "@/server/entitlements";
import { childLogger } from "@pdm/shared/logger";
import { withApiErrors } from "../_lib/with-errors";

const log = childLogger({ component: "api-v1-websites" });

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * PUBLIC REST API v1 — Websites List & Create
 * Spec: dev-doc3/phases/phase-16-public-api-webhooks.md
 */

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

async function handlePOST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
      { status: 401 },
    );
  }

  const scopeError = requireApiScope(auth, "write");
  if (scopeError) return scopeError;

  await enforceApiWriteRateLimit(auth.keyId);

  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const body = websiteSchemas.createWebsiteSchema.parse(rawJson);

  const outcome = await validateWebsiteUrl(
    { agencyId: auth.agencyId, userId: auth.keyId },
    body.url,
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

  try {
    await requireAllowedValue(auth.agencyId, "scanFrequencies", body.scanFrequency);
  } catch {
    return NextResponse.json(
      { error: { code: "PLAN_LIMIT_REACHED", message: "Requested scan frequency is not allowed on current plan" } },
      { status: 403 },
    );
  }

  /*
   * ⚠️ ENTITLEMENT ENFORCEMENT (F-004) AND VALIDATION (F-038).
   * Validated against the schema enum, then entitlement-checked.
   */
  if (body.scanPriority === "HIGH") {
    const entitlements = await getEntitlements(auth.agencyId);
    if (entitlements.scanPriority !== "HIGH") {
      return NextResponse.json(
        { error: { code: "PLAN_LIMIT_REACHED", message: "HIGH scan priority is not allowed on current plan" } },
        { status: 403 },
      );
    }
  }

  const { normalized } = outcome;
  const repos = repositoriesFor(auth.agencyId);

  try {
    const created = await repos.websites.create(
      {
        url: normalized.url,
        originalUrl: body.url,
        host: normalized.host,
        registrableDomain: normalized.registrableDomain,
        label: body.label ?? null,
        scanFrequency: body.scanFrequency,
        scanPriority: body.scanPriority,
        monitoredPaths: body.monitoredPaths,
        alertProfile: body.alertProfile,
        respectRobots: body.respectRobots ?? null,
        nextScanAt: body.scanFrequency === "MANUAL" ? null : new Date(),
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

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);

