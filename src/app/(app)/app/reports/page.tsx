import { t } from "@pdm/shared/copy";
import { REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterForm, SearchField, SelectField } from "@/components/ui/filter-form";
import { PageHeader } from "@/components/ui/page-header";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { Pagination } from "@/components/ui/pagination";
import { formatBytes, formatDate } from "@/lib/format";
import { REPORT_STATUS_TONE } from "@/lib/labels";
import { Can } from "@/components/can";
import { requirePermission } from "@/server/auth/context";
import { getReportList } from "@/server/queries/reports";

/**
 * REPORT LIBRARY — §3.11, UI_DESIGN_PROMPTS §5.19.
 *
 * ⚠️ A `FAILED` ROW CARRIES THE REASSURANCE, not just the status. §12.3
 * requires the failure copy to say the allowance was not charged — a red pill
 * alone leaves the agency assuming they paid for nothing.
 *
 * ⚠️ NO DOWNLOAD LINK IS RENDERED HERE. Download goes through
 * `/api/v1/reports/[id]/download`, which re-asserts the tenant and mints a
 * short-lived signed URL per click (§10.7). Embedding twenty signed URLs in a
 * list would hand the browser twenty live credentials.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/app/reports">) {
  const ctx = await requirePermission("report:read");
  const raw = await searchParams;
  const { query, page } = await getReportList(ctx, raw);

  const columns: Column[] = [
    { key: "report", label: t("reports.columnReport") },
    { key: "type", label: t("reports.columnType") },
    { key: "scope", label: t("reports.columnScope"), hideBelow: "lg" },
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
      scope: (
        <span className="text-muted-foreground">
          {report.website
            ? report.website.url.replace(/^https?:\/\//, "")
            : (report.client?.name ?? t("reports.scopeAgency"))}
        </span>
      ),
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

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        actions={
          <Can permission="report:generate" role={ctx.role}>
            <ButtonLink href="/app/reports/new" variant="primary">
              {t("reports.generate")}
            </ButtonLink>
          </Can>
        }
      />

      <FilterForm
        clearHref={query.search || query.type || query.status ? "/app/reports" : undefined}
      >
        <SearchField defaultValue={query.search} placeholder={t("reports.title")} />
        <SelectField
          name="type"
          label={t("reports.columnType")}
          defaultValue={query.type}
          options={[
            { value: "", label: t("filters.all") },
            ...Object.entries(REPORT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
        <SelectField
          name="status"
          label={t("reports.columnStatus")}
          defaultValue={query.status}
          options={[
            { value: "", label: t("filters.all") },
            ...Object.entries(REPORT_STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </FilterForm>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("reports.emptyTitle")}
            body={
              query.search || query.type || query.status
                ? t("empty.noMatches")
                : t("reports.emptyBody")
            }
            action={
              <Can permission="report:generate" role={ctx.role}>
                <ButtonLink href="/app/reports/new" variant="primary">
                  {t("reports.generate")}
                </ButtonLink>
              </Can>
            }
          />
        ) : (
          <DataList
            caption={t("reports.title")}
            columns={columns}
            rows={rows}
            footer={
              <Pagination
                page={query.page}
                perPage={query.perPage}
                total={page.total}
                params={raw}
              />
            }
          />
        )}
      </Card>
    </div>
  );
}
