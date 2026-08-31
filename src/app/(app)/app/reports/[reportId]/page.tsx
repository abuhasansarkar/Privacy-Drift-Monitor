import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { ReportActions, RevokeShareButton } from "@/components/reports/report-actions";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/severity-badge";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { REPORT_STATUS_TONE } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";
import { getReportDetail } from "@/server/queries/reports";

/**
 * REPORT DETAIL — §3.11, UI_DESIGN_PROMPTS §5.20.
 *
 * ⚠️ THE PREVIEW IS AN `<iframe>` ON A SIGNED URL MINTED PER REQUEST. §10.7: a
 * signed URL is never stored and never embedded in a list. The iframe points at
 * our own download route, which re-asserts the tenant and redirects — so the
 * page's HTML carries no credential at all.
 *
 * ⚠️ EVERY NON-READY STATE IS DESIGNED (§11.7/§11.8): Queued, Generating,
 * Failed and Ready each say what is happening and what to do. A FAILED report
 * carries the §12.3 reassurance in the user's own words.
 */
export default async function ReportDetailPage({
  params,
}: PageProps<"/app/reports/[reportId]">) {
  const ctx = await requirePermission("report:read");
  const { reportId } = await params;
  const report = await getReportDetail(ctx, reportId);

  // A report from another agency is not found, never forbidden (§6.2).
  if (!report) notFound();

  const period =
    report.periodStart && report.periodEnd
      ? `${formatDate(report.periodStart, ctx.timezone)} – ${formatDate(report.periodEnd, ctx.timezone)}`
      : t("reports.noPeriod");

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={report.name}
        subtitle={`${REPORT_TYPE_LABEL[report.type]} · ${period}`}
        actions={
          <StatusBadge
            tone={REPORT_STATUS_TONE[report.status]}
            label={REPORT_STATUS_LABEL[report.status]}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card className="min-h-[420px]">
          <CardHeader title={t("reports.previewLabel")} />
          <div className="p-4">
            {report.status === "READY" ? (
              <iframe
                title={report.name}
                src={`/api/reports/${report.id}/download?disposition=inline`}
                className="h-[70vh] w-full rounded-sm border border-border bg-[#F8FAFC]"
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border px-6 text-center">
                <p className="text-h4">{REPORT_STATUS_LABEL[report.status]}</p>
                <p className="max-w-sm text-small text-muted-foreground">
                  {report.status === "FAILED"
                    ? t("reports.failed")
                    : report.status === "GENERATING"
                      ? t("reports.generatingBody")
                      : t("reports.queuedBody")}
                </p>
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t("reports.metadata")} />
            <dl className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-1">
              <Row label={t("reports.columnType")} value={REPORT_TYPE_LABEL[report.type]} />
              <Row
                label={t("reports.columnScope")}
                value={
                  report.website?.url ?? report.client?.name ?? t("reports.scopeAgency")
                }
              />
              <Row label={t("reports.columnPeriod")} value={period} />
              <Row
                label={t("reports.columnGeneratedBy")}
                value={report.createdBy.firstName ?? report.createdBy.email}
              />
              <Row
                label={t("reports.columnGenerated")}
                value={
                  report.generatedAt
                    ? formatDateTime(report.generatedAt, ctx.timezone)
                    : "—"
                }
              />
              <Row
                label={t("reports.columnSize")}
                value={report.sizeBytes === null ? "—" : formatBytes(report.sizeBytes)}
              />
              <Row
                label={t("reports.downloads")}
                value={formatNumber(report.downloadCount)}
              />
            </dl>
            <div className="border-t border-border p-4">
              <ReportActions
                reportId={report.id}
                status={report.status}
                canShare={can(ctx.role, "report:share")}
                canDelete={can(ctx.role, "report:delete")}
              />
            </div>
          </Card>

          {report.shares.length > 0 ? (
            <Card>
              <CardHeader
                title={`${t("reports.sharedLinks")} (${formatNumber(report.shares.length)})`}
              />
              <ul>
                {report.shares.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-small">
                        {t("reports.shareExpires")}{" "}
                        <time dateTime={share.expiresAt.toISOString()}>
                          {formatDateTime(share.expiresAt, ctx.timezone)}
                        </time>
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {formatNumber(share.accessCount)} ×
                      </p>
                    </div>
                    <RevokeShareButton reportId={report.id} shareId={share.id} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-small font-medium">{value}</dd>
    </div>
  );
}
