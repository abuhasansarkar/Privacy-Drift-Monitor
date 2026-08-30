import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FilterForm,
  SearchField,
  SelectField,
} from "@/components/ui/filter-form";
import { HealthScore } from "@/components/ui/health-score";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  MutedBadge,
  SeverityBadge,
  StatusBadge,
} from "@/components/ui/severity-badge";
import { formatNumber } from "@/lib/format";
import { requireAgencyContext } from "@/server/auth/context";
import { getClientList } from "@/server/queries/lists";

/**
 * CLIENTS — §3.7, Phase 1 task 1.5.
 *
 * ⚠️ `averageHealthScore` is null for a client whose websites have never been
 * scanned, and `HealthScore` renders that as "— never scanned". Do not
 * coalesce it to 0: a never-scanned client is not a client scoring zero, and
 * this is the one number the account manager reads first.
 */
export default async function ClientsPage({
  searchParams,
}: PageProps<"/app/clients">) {
  const ctx = await requireAgencyContext();
  const raw = await searchParams;
  const { query, page } = await getClientList(ctx, raw);

  const columns: Column[] = [
    { key: "name", label: t("clients.columnClient") },
    { key: "websites", label: t("clients.columnWebsites"), align: "end" },
    { key: "health", label: t("clients.averageHealth"), align: "end" },
    { key: "issues", label: t("clients.columnOpenIssues") },
    { key: "portal", label: t("clients.columnPortal"), hideBelow: "lg" },
  ];

  // No `href` yet — the client detail page is still to be built, and a row that
  // navigates to a 404 is worse than a row that does not navigate.
  const rows: Row[] = page.items.map((client) => ({
    id: client.id,
    primary: client.name,
    secondary: client.websiteCount > 0 ? undefined : t("empty.noWebsites"),
    dimmed: client.archivedAt !== null,
    cells: {
      websites: (
        <span className="tabular-nums">{formatNumber(client.websiteCount)}</span>
      ),
      health: <HealthScore score={client.averageHealthScore} />,
      issues:
        client.openIssueCount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            {client.criticalIssueCount > 0 ? (
              <SeverityBadge
                severity="CRITICAL"
                count={client.criticalIssueCount}
              />
            ) : null}
            {client.openIssueCount > client.criticalIssueCount ? (
              <MutedBadge>
                {formatNumber(client.openIssueCount - client.criticalIssueCount)}
              </MutedBadge>
            ) : null}
          </span>
        ),
      portal: client.portalEnabled ? (
        <StatusBadge tone="success" label={t("clients.portalEnabled")} />
      ) : (
        <StatusBadge tone="muted" label={t("clients.portalOff")} />
      ),
    },
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/*
        No action button: the create flow is not built yet, and offering one
        that 404s is worse than offering none. `<Can permission="client:create">`
        returns here with it.
      */}
      <PageHeader
        title={t("clients.title")}
        subtitle={`${formatNumber(page.total)} ${t("clients.title").toLowerCase()}`}
      />

      <FilterForm
        clearHref={
          query.search || query.includeArchived ? "/app/clients" : undefined
        }
      >
        <SearchField
          defaultValue={query.search}
          placeholder={t("clients.searchPlaceholder")}
        />
        <SelectField
          name="archived"
          label={t("clients.archived")}
          defaultValue={query.includeArchived ? "1" : ""}
          options={[
            { value: "", label: t("clients.archivedHidden") },
            { value: "1", label: t("clients.archivedShown") },
          ]}
        />
      </FilterForm>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("clients.title")}
            body={
              query.search ? t("empty.noMatches") : t("empty.noClients")
            }
          />
        ) : (
          <DataList
            caption={t("clients.title")}
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
