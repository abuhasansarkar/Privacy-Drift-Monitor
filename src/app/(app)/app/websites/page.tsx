import type { MonitoringStatus, ScanFrequency } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { Can } from "@/components/can";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FilterForm,
  SearchField,
  SelectField,
} from "@/components/ui/filter-form";
import { HealthScore } from "@/components/ui/health-score";
import { PlusIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  MutedBadge,
  SeverityBadge,
  StatusBadge,
} from "@/components/ui/severity-badge";
import { formatNumber, formatRelative } from "@/lib/format";
import { requireAgencyContext } from "@/server/auth/context";
import { getWebsiteList } from "@/server/queries/lists";

/**
 * WEBSITES — §3.6, Phase 1 task 1.6.
 *
 * The working surface of the product. Filters are URL-serialised so a view is
 * shareable and back-navigable (§3.6) — `?status=ACTIVE&sort=healthScore` is
 * the state, not component state.
 *
 * ⚠️ A PAUSED site says so rather than quietly going stale, and a site with no
 * scan says "never scanned" rather than showing a zero score. Both are the same
 * rule: the list never implies a monitoring result the scanner did not produce.
 */

const MONITORING_LABEL: Record<MonitoringStatus, string> = {
  ACTIVE: t("monitoring.active"),
  PAUSED: t("monitoring.paused"),
  ERROR: t("monitoring.error"),
};

const MONITORING_TONE = {
  ACTIVE: "success",
  PAUSED: "muted",
  ERROR: "warning",
} as const;

const FREQUENCY_LABEL: Record<ScanFrequency, string> = {
  DAILY: t("frequency.daily"),
  WEEKLY: t("frequency.weekly"),
  MONTHLY: t("frequency.monthly"),
  MANUAL: t("frequency.manual"),
};

export default async function WebsitesPage({
  searchParams,
}: PageProps<"/app/websites">) {
  const ctx = await requireAgencyContext();
  const raw = await searchParams;
  const { query, page } = await getWebsiteList(ctx, raw);

  // Captured once so every row formats against the same instant — calling
  // Date.now() per row would drift and would not be reproducible in a test.
  const now = new Date();

  const columns: Column[] = [
    { key: "site", label: t("websites.columnWebsite") },
    { key: "health", label: t("websites.columnHealth"), align: "end" },
    { key: "lastScan", label: t("websites.columnLastScan") },
    { key: "issues", label: t("websites.columnOpenIssues") },
    { key: "frequency", label: t("websites.columnFrequency"), hideBelow: "xl" },
    { key: "monitoring", label: t("websites.columnMonitoring") },
  ];

  // No `href` yet — the detail page is still to be built. See the dashboard.
  const rows: Row[] = page.items.map((site) => ({
    id: site.id,
    primary: <span className="font-mono text-mono">{site.url}</span>,
    secondary: site.label ?? site.client?.name ?? undefined,
    dimmed: site.monitoringStatus === "PAUSED" || site.archivedAt !== null,
    cells: {
      health: <HealthScore score={site.healthScore} />,
      lastScan: site.lastScanAt ? (
        <time
          dateTime={site.lastScanAt.toISOString()}
          className="text-muted-foreground"
        >
          {formatRelative(site.lastScanAt, now)}
        </time>
      ) : (
        <span className="text-muted-foreground">{t("websites.neverScanned")}</span>
      ),
      issues:
        site.openIssueCount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            {site.criticalIssueCount > 0 ? (
              <SeverityBadge severity="CRITICAL" count={site.criticalIssueCount} />
            ) : null}
            {site.openIssueCount > site.criticalIssueCount ? (
              <MutedBadge>
                {formatNumber(site.openIssueCount - site.criticalIssueCount)}
              </MutedBadge>
            ) : null}
          </span>
        ),
      frequency: (
        <span className="text-muted-foreground">
          {FREQUENCY_LABEL[site.scanFrequency]}
        </span>
      ),
      monitoring: (
        <StatusBadge
          tone={MONITORING_TONE[site.monitoringStatus]}
          label={MONITORING_LABEL[site.monitoringStatus]}
        />
      ),
    },
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title={t("websites.title")}
        subtitle={`${formatNumber(page.total)} ${t("websites.title").toLowerCase()}`}
        actions={
          <Can role={ctx.role} permission="website:create">
            <ButtonLink href="/app/websites/new" variant="primary">
              <PlusIcon />
              {t("websites.addWebsite")}
            </ButtonLink>
          </Can>
        }
      />

      <FilterForm
        clearHref={query.search || query.status ? "/app/websites" : undefined}
      >
        <SearchField
          defaultValue={query.search}
          placeholder={t("websites.searchPlaceholder")}
        />
        <SelectField
          name="status"
          label={t("websites.filterStatus")}
          defaultValue={query.status}
          options={[
            { value: "", label: t("filters.all") },
            { value: "ACTIVE", label: t("monitoring.active") },
            { value: "PAUSED", label: t("monitoring.paused") },
            { value: "ERROR", label: t("monitoring.error") },
          ]}
        />
      </FilterForm>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("websites.title")}
            body={
              query.search || query.status
                ? t("empty.noMatches")
                : t("empty.noWebsites")
            }
            action={
              <Can role={ctx.role} permission="website:create">
                <ButtonLink href="/app/websites/new" variant="primary">
                  <PlusIcon />
                  {t("websites.addWebsite")}
                </ButtonLink>
              </Can>
            }
          />
        ) : (
          <DataList
            caption={t("websites.title")}
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
