import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { formatBytes, formatDate } from "@/lib/format";
import { REPORT_STATUS_TONE } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getReportList } from "@/server/queries/reports";

/**
 * WEBSITE DETAIL — REPORTS TAB — §3.8 ("Reports scoped to this website;
 * generate new; download; delete").
 *
 * ⚠️ SCOPED BY `websiteId`, FORCED. Same rule as the Issues tab: the filter is
 * overwritten after parsing, so a hand-edited `?website=` cannot widen this tab
 * to another site's reports.
 *
 * ⚠️ "Generate new" LANDS ON THE WIZARD WITH THE WEBSITE PRESELECTED rather
 * than generating inline. A report has a type, a period and four options; a
 * one-click generate here would have to pick all of them silently.
 */
export default async function WebsiteReportsPage({
  params,
  searchParams,
}: PageProps<"/app/websites/[websiteId]/reports">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId, "report:read");

  const raw = await searchParams;
  const { page } = await getReportList(ctx, { ...raw, website: websiteId });

  const columns: Column[] = [
    { key: "report", label: t("reports.columnReport") },
    { key: "type", label: t("reports.columnType") },
    { key: "period", label: t("reports.columnPeriod"), hideBelow: "lg" },
    { key: "status", label: t("reports.columnStatus") },
    { key: "size", label: t("reports.columnSize"), align: "end", hideBelow: "xl" },
    { key: "generated", label: t("reports.columnGenerated"), align: "end" },
  ];

  const rows: Row[] = page.items.map((report) => ({
    id: report.id,
    href: `/app/reports/${report.id}`,
    primary: report.name,
    secondary:
      report.status === "FAILED"
        ? t("reports.failed")
        : (report.createdBy.firstName ?? report.createdBy.email),
    tone: report.status === "FAILED" ? "warning" : undefined,
    cells: {
      report: null,
      type: <MutedBadge>{REPORT_TYPE_LABEL[report.type]}</MutedBadge>,
      period:
        report.periodStart && report.periodEnd ? (
          <span className="text-muted-foreground">
            {formatDate(report.periodStart, ctx.timezone)} –{" "}
            {formatDate(report.periodEnd, ctx.timezone)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("reports.noPeriod")}</span>
        ),
      status: (
        <StatusBadge
          tone={REPORT_STATUS_TONE[report.status]}
          label={REPORT_STATUS_LABEL[report.status]}
        />
      ),
      size: (
        <span className="tabular-nums text-muted-foreground">
          {report.sizeBytes === null ? "—" : formatBytes(report.sizeBytes)}
        </span>
      ),
      generated: (
        <time dateTime={report.createdAt.toISOString()} className="text-muted-foreground">
          {formatDate(report.createdAt, ctx.timezone)}
        </time>
      ),
    },
  }));

  const generateHref = `/app/reports/new?website=${websiteId}`;

  return (
    <div className="flex flex-col gap-4">
      {can(ctx.role, "report:generate") ? (
        <div className="flex justify-end">
          <ButtonLink href={generateHref} variant="primary">
            {t("reports.generate")}
          </ButtonLink>
        </div>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("reports.emptyTitle")}
            body={t("reports.emptyBody")}
            action={
              can(ctx.role, "report:generate") ? (
                <ButtonLink href={generateHref} variant="primary">
                  {t("reports.generate")}
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <DataList caption={t("reports.title")} columns={columns} rows={rows} />
        )}
      </Card>
    </div>
  );
}
