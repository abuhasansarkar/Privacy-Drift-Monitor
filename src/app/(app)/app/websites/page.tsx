import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Can } from "@/components/can";
import { WebsitesTable } from "@/components/websites/websites-table";
import { ViewToggle, WebsiteGrid } from "@/components/websites/website-grid";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Column, Row } from "@/components/ui/data-list";
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
import {
  FREQUENCY_LABEL,
  MONITORING_LABEL,
  MONITORING_TONE,
} from "@/lib/labels";
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
 *
 * ⚠️ THE VIEW MODE IS IN THE URL, like every other list control (§3.5). Holding
 * it in component state would make a shared link land on someone else's default
 * — and would lose it on every navigation back to this page.
 *
 * ⚠️ BULK SELECTION IS TABLE-ONLY. The grid is a recognition surface, and a
 * checkbox on each card turns it back into a table with worse density. §3.5
 * lists selection under the table's row actions, not the grid's.
 */

export default async function WebsitesPage({
  searchParams,
}: PageProps<"/app/websites">) {
  const ctx = await requireAgencyContext();
  const raw = await searchParams;
  const { query, page, clients, groups } = await getWebsiteList(ctx, raw);

  const view =
    (Array.isArray(raw.view) ? raw.view[0] : raw.view) === "grid" ? "grid" : "table";

  const filtered =
    query.search !== undefined ||
    query.status !== undefined ||
    query.clientId !== undefined ||
    query.groupId !== undefined;

  // The export carries the ACTIVE FILTERS (§3.5 "Export selected"): an export
  // that ignored them would hand back the whole portfolio when the user asked
  // for one client.
  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries({
    search: query.search,
    status: query.status,
    client: query.clientId,
    group: query.groupId,
  })) {
    if (value) exportParams.set(key, String(value));
  }
  const exportHref = `/api/websites/export${
    exportParams.size > 0 ? `?${exportParams}` : ""
  }`;

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

  const rows: Row[] = page.items.map((site) => ({
    id: site.id,
    href: `/app/websites/${site.id}`,
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
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("websites.title")}
        subtitle={`${formatNumber(page.total)} ${t("websites.title").toLowerCase()}`}
        actions={
          <>
            {/* A plain <a>: the CSV is a download, and the client router would
                try to treat the response as a navigation. */}
            <a
              href={exportHref}
              download
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-small font-medium hover:bg-muted max-sm:h-11"
            >
              {t("websites.exportCsv")}
            </a>
            <Can role={ctx.role} permission="website:create">
              <ButtonLink href="/app/websites/import" variant="secondary">
                {t("import.title")}
              </ButtonLink>
            </Can>
            <Can role={ctx.role} permission="website:create">
              <ButtonLink href="/app/websites/new" variant="primary">
                <PlusIcon />
                {t("websites.addWebsite")}
              </ButtonLink>
            </Can>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <FilterForm clearHref={filtered ? "/app/websites" : undefined}>
            {/* The view survives a filter submit — otherwise choosing a client
                silently throws you back to the table. */}
            {view === "grid" ? <input type="hidden" name="view" value="grid" /> : null}
            <SearchField
              defaultValue={query.search}
              placeholder={t("websites.searchPlaceholder")}
            />
            <SelectField
              name="client"
              label={t("websites.filterClient")}
              defaultValue={query.clientId}
              options={[
                { value: "", label: t("websites.anyClient") },
                ...clients.map((client) => ({ value: client.id, label: client.name })),
              ]}
            />
            <SelectField
              name="group"
              label={t("websites.filterGroup")}
              defaultValue={query.groupId}
              options={[
                { value: "", label: t("websites.anyGroup") },
                ...groups.map((group) => ({ value: group.id, label: group.name })),
              ]}
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
        </div>
        <ViewToggle view={view} params={raw} />
      </div>

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
        ) : view === "grid" ? (
          <WebsiteGrid
            now={now}
            sites={page.items.map((site) => ({
              id: site.id,
              url: site.url,
              label: site.label,
              clientName: site.client?.name ?? null,
              healthScore: site.healthScore,
              monitoringStatus: site.monitoringStatus,
              openIssueCount: site.openIssueCount,
              criticalIssueCount: site.criticalIssueCount,
              lastScanAt: site.lastScanAt,
              archived: site.archivedAt !== null,
            }))}
            footer={
              <Pagination
                page={query.page}
                perPage={query.perPage}
                total={page.total}
                params={raw}
              />
            }
          />
        ) : (
          <WebsitesTable
            columns={columns}
            rows={rows}
            ids={rows.map((row) => row.id)}
            canUpdate={can(ctx.role, "website:update")}
            canArchive={can(ctx.role, "website:delete")}
            canScan={can(ctx.role, "scan:trigger")}
            clients={clients}
            groups={groups}
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
