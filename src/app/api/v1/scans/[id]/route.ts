import { NextResponse } from "next/server";
import { forAgency } from "@pdm/database/tenant";
import { authenticateApiKey, requireApiScope } from "@/server/auth/api-auth";

/**
 * Get detailed scan results via public API.
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

  const { id: scanId } = await context.params;
  const db = forAgency(auth.agencyId);

  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      website: { agencyId: auth.agencyId },
    },
    include: {
      website: {
        select: {
          id: true,
          url: true,
          label: true,
        },
      },
      issues: {
        select: {
          id: true,
          ruleId: true,
          title: true,
          category: true,
          severity: true,
          status: true,
        },
      },
      driftEvents: {
        select: {
          id: true,
          changeType: true,
          severity: true,
          summary: true,
        },
      },
      consentModeAudit: {
        select: {
          isConsentModeDetected: true,
          preConsentAdStorage: true,
          preConsentAnalytics: true,
          postRejectAdStorage: true,
          postRejectAnalytics: true,
          postRejectUserData: true,
          postRejectPersonalize: true,
          issuesDetected: true,
        },
      },
    },
  });

  if (!scan) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Scan not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      id: scan.id,
      websiteId: scan.websiteId,
      website: scan.website,
      status: scan.status,
      trigger: scan.trigger,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      durationMs: scan.durationMs,
      pagesScanned: scan.pagesScanned,
      scannerVersion: scan.scannerVersion,
      browserVersion: scan.browserVersion,
      errorCode: scan.errorCode,
      errorMessage: scan.errorMessage,
      cmp: scan.detectedCmpName
        ? {
            id: scan.detectedCmpId,
            name: scan.detectedCmpName,
            version: scan.detectedCmpVersion,
            confidence: scan.cmpConfidence,
          }
        : null,
      issues: scan.issues,
      issuesCount: scan.issues.length,
      driftEvents: scan.driftEvents,
      consentModeAudit: scan.consentModeAudit ?? null,
    },
  });
}
