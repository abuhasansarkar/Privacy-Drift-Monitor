import { t } from "@pdm/shared/copy";
import { Can } from "@/components/can";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { HealthScore } from "@/components/ui/health-score";
import { PlusIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { MutedBadge, SeverityBadge } from "@/components/ui/severity-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { formatNumber } from "@/lib/format";
import { requireAgencyContext } from "@/server/auth/context";
import { getDashboardOverview } from "@/server/queries/dashboard";

/**
 * DASHBOARD — §3.4, Phase 1 task 1.12.
 *
 * Context is re-resolved here rather than read from the layout: Next renders
 * layouts and pages independently, so a page that trusts its layout's auth
 * check is trusting something it cannot observe (§6.1).
 *
 * ⚠️ NO DRIFT CARD YET. The design has one; the drift tables arrive in Phase 3.
 * Rendering "no changes detected" from a query that does not exist would be the
 * UI asserting a scanner fact (P1), so the card is absent rather than empty.
 */
export default async function DashboardPage() {
  const ctx = await requireAgencyContext();
  const overview = await getDashboardOverview(ctx);

  const columns: Column[] = [
    { key: "site", label: t("websites.columnWebsite") },
    { key: "issues", label: t("dashboard.openIssues") },
    { key: "health", label: t("websites.columnHealth"), align: "end" },
  ];

  const rows: Row[] = overview.needsAttention.map((site) => ({
    id: site.id,
    href: `/app/websites/${site.id}`,
    primary: <span className="font-mono text-mono">{site.url}</span>,
    secondary: site.clientName,
    cells: {
      issues: (
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
      health: <HealthScore score={site.healthScore} />,
    },
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title={t("dashboard.title")}
        subtitle={ctx.agencyName}
        actions={
          <Can role={ctx.role} permission="website:create">
            <ButtonLink href="/app/websites/new" variant="primary">
              <PlusIcon />
              {t("dashboard.addWebsite")}
            </ButtonLink>
          </Can>
        }
      />

      {/* 1 → 2 → 4 columns. Four tiles side by side is unreadable under ~700px. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("dashboard.websitesMonitored")}
          value={formatNumber(overview.websitesTotal)}
          note={
            <>
              <MutedBadge>
                {formatNumber(overview.websitesActive)} {t("monitoring.active")}
              </MutedBadge>
              {overview.websitesPaused > 0 ? (
                <MutedBadge>
                  {formatNumber(overview.websitesPaused)} {t("monitoring.paused")}
                </MutedBadge>
              ) : null}
            </>
          }
        />
        <StatTile
          label={t("dashboard.openIssues")}
          value={formatNumber(overview.openIssues)}
          note={
            overview.criticalIssues > 0 ? (
              <SeverityBadge severity="CRITICAL" count={overview.criticalIssues} />
            ) : null
          }
        />
        <StatTile
          label={t("dashboard.averageHealth")}
          value={<HealthScore score={overview.averageHealthScore} showBand />}
        />
        <StatTile
          label={t("clients.title")}
          value={formatNumber(overview.clientsTotal)}
        />
      </div>

      <Card>
        <CardHeader
          title={t("dashboard.needsAttention")}
          action={
            <ButtonLink href="/app/websites" variant="ghost" size="sm">
              {t("dashboard.viewAllWebsites")}
            </ButtonLink>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t("dashboard.needsAttention")}
            body={
              overview.websitesTotal === 0
                ? t("empty.noWebsites")
                : t("dashboard.needsAttentionEmpty")
            }
            action={
              overview.websitesTotal === 0 ? (
                <Can role={ctx.role} permission="website:create">
                  <ButtonLink href="/app/websites/new" variant="primary">
                    <PlusIcon />
                    {t("dashboard.addWebsite")}
                  </ButtonLink>
                </Can>
              ) : null
            }
          />
        ) : (
          <DataList
            caption={t("dashboard.needsAttention")}
            columns={columns}
            rows={rows}
          />
        )}
      </Card>
    </div>
  );
}
