import { NextResponse } from "next/server";
import { SCAN_STATUS_LABEL } from "@pdm/shared/copy/labels";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getScanChoices } from "@/server/queries/reports";
import { toAppError } from "@pdm/shared/errors";
import { triggerScan } from "@/server/services/scan-service";
import { ConflictError, EntitlementExceededError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";

const log = childLogger({ component: "api-v1-trigger-scan" });

/**
 * A website's recent scans, for the report wizard's scan selector.
 *
 * ⚠️ SESSION-AUTHENTICATED, UNLIKE THE `POST` BELOW. This is the agency UI's own
 * reader, moved under `/api/v1` when the two API roots were consolidated; the
 * POST is the customer-facing key-authenticated trigger. Two credentials on one
 * path is the cost of that consolidation — keep the checks separate and in the
 * handler that needs them.
 *
 * ⚠️ `requireWebsiteAccess` FIRST. It re-checks the tenant AND the member's
 * website scope, and raises NOT_FOUND rather than FORBIDDEN — a 403 would
 * confirm the id exists somewhere the caller cannot see (§6.2).
 *
 * ⚠️ NOT CACHED, and no `dynamic` export. Route Handler GET is uncached by
 * default in Next 16; `force-dynamic` here would be cargo-cult.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: websiteId } = await context.params;
    const ctx = await requireWebsiteAccess(websiteId);
    const scans = await getScanChoices(ctx, websiteId);

    const format = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: ctx.timezone,
    });

    return NextResponse.json({
      scans: scans.map((scan) => ({
        id: scan.id,
        // The label carries the STATUS, so a PARTIAL scan is visibly partial in
        // the selector rather than discovered inside the finished PDF (P5).
        label: `${scan.finishedAt ? format.format(scan.finishedAt) : "—"} · ${
          SCAN_STATUS_LABEL[scan.status]
        }${scan.healthScore !== null && scan.status === "COMPLETED" ? ` · ${scan.healthScore}` : ""}`,
      })),
    });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(
      { error: { code: appError.code, message: appError.expose ? appError.message : undefined } },
      { status: appError.httpStatus },
    );
  }
}

/**
 * Trigger an on-demand scan for a website via public API.
 * Returns 202 Accepted with scanId and status.
 */
export async function POST(
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

  const { id: websiteId } = await context.params;

  try {
    const { scanId } = await triggerScan({
      agencyId: auth.agencyId,
      websiteId,
      userId: null,
      trigger: "API",
    });

    log.info({ websiteId, scanId, agencyId: auth.agencyId }, "scan triggered via public api");

    return NextResponse.json(
      {
        data: {
          scanId,
          websiteId,
          status: "QUEUED",
          message: "Scan has been enqueued successfully",
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: error.message, details: error.details } },
        { status: 409 },
      );
    }
    if (error instanceof EntitlementExceededError) {
      return NextResponse.json(
        { error: { code: "PLAN_LIMIT_REACHED", message: error.message } },
        { status: 402 },
      );
    }

    log.error({ err: error, websiteId, agencyId: auth.agencyId }, "failed to trigger scan via api");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to trigger scan" } },
      { status: 500 },
    );
  }
}
