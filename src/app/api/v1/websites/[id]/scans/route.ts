import { NextResponse } from "next/server";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";
import { triggerScan } from "@/server/services/scan-service";
import { ConflictError, EntitlementExceededError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";

const log = childLogger({ component: "api-v1-trigger-scan" });

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
