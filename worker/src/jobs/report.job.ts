import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  DEFAULT_REPORT_OPTIONS,
  renderPdf,
  renderReportHtml,
  resolveBranding,
  toBrandingSnapshot,
  type ReportOptions,
} from "@pdm/reports";
import {
  enqueueNotification,
  type NotificationJobData,
  type ReportJobData,
} from "@pdm/scanner/queue/queues";
import { childLogger } from "@pdm/shared/logger";
import { objectStore } from "@pdm/storage";
import type { Queue } from "bullmq";
import { collectReportDocument } from "./report-data";

/**
 * REPORT GENERATION JOB — PLAN.md Part VI §6.8, Phase 4 task 4.4.
 *
 * The pipeline §6.8 specifies:
 *   status=GENERATING → collect via tenant-scoped repositories → render React
 *   to HTML → Playwright page.pdf() → upload under the tenant prefix →
 *   status=READY → notify. On failure: status=FAILED + errorCode → notify.
 *
 * ⚠️ A FAILED REPORT DOES NOT CONSUME THE ALLOWANCE (§12.3), and the failure
 * notification says so in those words. Usage is recorded in `markReady` and
 * nowhere else, so there is no path where a render error costs a customer a
 * report they never received.
 *
 * ⚠️ BRANDING IS RESOLVED ONCE, BY EXPLICIT `agencyId`, AND SNAPSHOTTED onto
 * the row (§6.9). A regenerate two years later renders from the snapshot, so
 * the document matches the one the client already has.
 */

const globalDb = unsafeGlobalClient(
  // Justification (required in review): the agency's name and timezone come
  // from the GLOBAL `Agency` model. Everything else is tenant-scoped below.
  "agency name and timezone for the report cover — Agency is a global model",
);

export interface ReportDeps {
  notificationQueue: Queue<NotificationJobData>;
  now?: () => Date;
}

export interface ReportJobResult {
  status: "READY" | "FAILED";
  sizeBytes?: number;
  pageCount?: number;
}

/** `agencies/<agencyId>/reports/<reportId>.pdf` — §10.7's tenant prefix. */
export function reportKey(agencyId: string, reportId: string): string {
  return `agencies/${agencyId}/reports/${reportId}.pdf`;
}

export async function generateReport(
  data: ReportJobData,
  deps: ReportDeps,
): Promise<ReportJobResult> {
  const now = deps.now?.() ?? new Date();
  const log = childLogger({ agencyId: data.agencyId, component: "reports" });
  const repos = repositoriesFor(data.agencyId);

  /*
   * ⚠️ GUARDED ON `QUEUED`. A retried job whose first attempt already finished
   * must not re-render — the second render would overwrite a document the user
   * may already have downloaded, and would double the Chromium cost.
   */
  const claimed = await repos.reports.markGenerating(data.reportId);
  if (!claimed) {
    log.info({ reportId: data.reportId }, "report already claimed; skipping");
    const existing = await repos.reports.findById(data.reportId);
    return { status: existing?.status === "READY" ? "READY" : "FAILED" };
  }

  const report = await repos.reports.findById(data.reportId);
  if (!report) {
    // The row was deleted between enqueue and pickup. Nothing to fail.
    log.warn({ reportId: data.reportId }, "report row is gone; nothing generated");
    return { status: "FAILED" };
  }

  try {
    const agency = await globalDb.agency.findUnique({
      where: { id: data.agencyId },
      select: { name: true, timezone: true },
    });

    const branding = await resolveBranding(data.agencyId, {
      // TODO(Phase 6): read the real `whiteLabel` entitlement. Until billing
      // lands, every agency renders with their own brand — which is the
      // permissive direction, and the resolver is the single place it flips.
      whiteLabelEnabled: true,
    });

    const document = await collectReportDocument({
      agencyId: data.agencyId,
      reportId: report.id,
      type: report.type,
      name: report.name,
      clientId: report.clientId,
      websiteId: report.websiteId,
      scanId: readScanId(report.options),
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      options: readOptions(report.options),
      branding,
      timeZone: agency?.timezone ?? "Europe/London",
      agencyName: agency?.name ?? branding.companyName,
      generatedAt: now,
    });

    const html = renderReportHtml(document);
    const pdf = await renderPdf({ html, branding, title: report.name });

    const key = reportKey(data.agencyId, report.id);
    await objectStore().put(key, pdf.buffer, "application/pdf");

    await repos.reports.markReady(report.id, {
      s3Key: key,
      sizeBytes: pdf.sizeBytes,
      pageCount: pdf.pageCount,
      // Frozen here and never refreshed (§6.8).
      brandingSnapshot: toBrandingSnapshot(branding) as never,
      generatedAt: now,
    });

    await notify(deps, {
      agencyId: data.agencyId,
      type: "REPORT_READY",
      severity: "INFO",
      title: report.name,
      body: periodLabel(report.periodStart, report.periodEnd, agency?.timezone),
      linkUrl: `/app/reports/${report.id}`,
      entityType: "report",
      entityId: report.id,
      dedupeKey: `report-ready:${report.id}`,
    });

    log.info(
      { reportId: report.id, pages: pdf.pageCount, bytes: pdf.sizeBytes },
      "report generated",
    );
    return { status: "READY", sizeBytes: pdf.sizeBytes, pageCount: pdf.pageCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await repos.reports.markFailed(report.id, "REPORT_GENERATION_FAILED", message.slice(0, 300));

    await notify(deps, {
      agencyId: data.agencyId,
      type: "REPORT_FAILED",
      severity: "LOW",
      title: report.name,
      // ⚠️ The reassurance §12.3 requires, in the user's own notification.
      body: "Nothing was charged against your report allowance. You can try generating it again.",
      linkUrl: `/app/reports/${report.id}`,
      entityType: "report",
      entityId: report.id,
      dedupeKey: `report-failed:${report.id}`,
    });

    log.error({ err: error, reportId: report.id }, "report generation failed");
    // NOT re-thrown. The failure is a RESULT the user has already been told
    // about; letting BullMQ retry would re-render a report that will fail the
    // same way and send a second failure notification.
    return { status: "FAILED" };
  }
}

async function notify(
  deps: ReportDeps,
  event: Omit<
    NotificationJobData,
    "websiteId" | "websiteGroupId" | "clientId" | "websiteLabel"
  >,
): Promise<void> {
  await enqueueNotification(deps.notificationQueue, {
    ...event,
    websiteId: null,
    websiteGroupId: null,
    clientId: null,
    websiteLabel: null,
  });
}

/**
 * The wizard stores `scanId` inside `options` rather than as a column: only one
 * of the five report types uses it, and a column that is null for four types is
 * a column that gets forgotten in the fifth.
 */
function readScanId(options: unknown): string | null {
  if (!options || typeof options !== "object") return null;
  const value = (options as Record<string, unknown>).scanId;
  return typeof value === "string" ? value : null;
}

function readOptions(options: unknown): ReportOptions {
  if (!options || typeof options !== "object") return DEFAULT_REPORT_OPTIONS;
  const raw = options as Record<string, unknown>;
  const bool = (key: keyof ReportOptions): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_REPORT_OPTIONS[key];
  return {
    includeEvidenceAppendix: bool("includeEvidenceAppendix"),
    includeAiSummary: bool("includeAiSummary"),
    includeResolvedIssues: bool("includeResolvedIssues"),
    includeScreenshots: bool("includeScreenshots"),
  };
}

function periodLabel(from: Date | null, to: Date | null, timeZone = "Europe/London"): string {
  if (!from || !to) return "Point in time";
  const format = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone });
  return `${format.format(from)} – ${format.format(to)}`;
}
