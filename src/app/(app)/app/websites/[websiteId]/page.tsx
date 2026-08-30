import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Can } from "@/components/can";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HealthScore } from "@/components/ui/health-score";
import { MutedBadge, SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { PageHeader } from "@/components/ui/page-header";
import { ScanStatusBadge } from "@/components/scans/scan-phases";
import { StartScanButton } from "@/components/scans/start-scan-button";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { WebsiteActions } from "@/components/websites/website-actions";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
} from "@/lib/format";
import { FREQUENCY_LABEL, MONITORING_LABEL, MONITORING_TONE } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getWebsiteDetail } from "@/server/queries/detail";
import { getWebsiteScans } from "@/server/queries/scans";

/**
 * WEBSITE DETAIL — §3.6, Phase 1 task 1.6.
 *
 * ⚠️ `requireWebsiteAccess()` rather than `requireAgencyContext()`. A member can
 * be restricted to specific websites (§6.2), and a site outside that scope must
 * raise NOT_FOUND, not FORBIDDEN — a 403 confirms the id exists somewhere the
 * caller cannot see.
 *
 * ⚠️ THE SCAN HISTORY LISTS OUTCOMES, NOT VERDICTS. Each row shows COMPLETED /
 * PARTIAL / FAILED as recorded — a PARTIAL scan is never collapsed into a tick,
 * because an incomplete recording must not read as a clean one (P5/P6).
 */
export default async function WebsiteDetailPage({
  params,
}: PageProps<"/app/websites/[websiteId]">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);

  const website = await getWebsiteDetail(ctx, websiteId);
  if (!website) notFound();

  const scans = await getWebsiteScans(ctx, websiteId);
  const now = new Date();

  const scanColumns: Column[] = [
    { key: "started", label: t("scans.columnStarted") },
    { key: "outcome", label: t("scans.columnStatus") },
    { key: "requests", label: t("scans.columnRequests"), align: "end" },
    { key: "duration", label: t("scans.columnDuration"), align: "end", hideBelow: "lg" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={
          <span className="font-mono text-h3 break-all">{website.url}</span>
        }
        subtitle={
          website.client ? (
            <Link
              href={`/app/clients/${website.client.id}`}
              className="underline-offset-2 hover:underline"
            >
              {website.client.name}
            </Link>
          ) : (
            t("addWebsite.noClient")
          )
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <Can role={ctx.role} permission="scan:trigger">
              <StartScanButton websiteId={website.id} />
            </Can>
            <WebsiteActions
              websiteId={website.id}
              monitoringStatus={website.monitoringStatus}
              canUpdate={can(ctx.role, "website:update")}
              canArchive={can(ctx.role, "website:delete")}
            />
          </div>
        }
      />

      {website.archivedAt ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-small text-muted-foreground">
          {t("websites.archivedNotice")}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("websites.columnHealth")}
          </p>
          <div className="mt-1 text-h3">
            <HealthScore score={website.healthScore} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("websites.columnMonitoring")}
          </p>
          <div className="mt-2">
            <StatusBadge
              tone={MONITORING_TONE[website.monitoringStatus]}
              label={MONITORING_LABEL[website.monitoringStatus]}
            />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("websites.columnOpenIssues")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {website.openIssueCount === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <>
                {website.criticalIssueCount > 0 ? (
                  <SeverityBadge
                    severity="CRITICAL"
                    count={website.criticalIssueCount}
                  />
                ) : null}
                {website.openIssueCount > website.criticalIssueCount ? (
                  <MutedBadge>
                    {formatNumber(website.openIssueCount - website.criticalIssueCount)}
                  </MutedBadge>
                ) : null}
              </>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("websites.columnLastScan")}
          </p>
          <p className="mt-1 text-body font-medium">
            {website.lastScanAt ? (
              <time dateTime={website.lastScanAt.toISOString()}>
                {formatRelative(website.lastScanAt, now)}
              </time>
            ) : (
              <span className="text-muted-foreground">
                {t("websites.neverScanned")}
              </span>
            )}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("websites.settingsTitle")} />
        <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
          <Detail label={t("addWebsite.urlLabel")}>
            <span className="font-mono text-mono break-all">{website.url}</span>
          </Detail>
          <Detail label={t("websites.originalUrlLabel")}>
            <span className="font-mono text-mono break-all">
              {website.originalUrl}
            </span>
          </Detail>
          <Detail label={t("websites.registrableDomainLabel")}>
            <span className="font-mono text-mono">{website.registrableDomain}</span>
          </Detail>
          <Detail label={t("addWebsite.frequencyLabel")}>
            {FREQUENCY_LABEL[website.scanFrequency]}
          </Detail>
          <Detail label={t("websites.nextScanLabel")}>
            {website.nextScanAt ? (
              <time dateTime={website.nextScanAt.toISOString()}>
                {formatDateTime(website.nextScanAt, ctx.timezone)}
              </time>
            ) : (
              // Null nextScanAt is the ONLY scheduling signal (§7.5), so it is
              // reported as "not scheduled" rather than left blank.
              <span className="text-muted-foreground">
                {t("websites.notScheduled")}
              </span>
            )}
          </Detail>
          <Detail label={t("websites.monitoredPathsLabel")}>
            <span className="font-mono text-mono">
              {website.monitoredPaths.join(", ")}
            </span>
          </Detail>
          <Detail label={t("websites.addedLabel")}>
            <time dateTime={website.createdAt.toISOString()}>
              {formatDateTime(website.createdAt, ctx.timezone)}
            </time>
          </Detail>
          {website.label ? (
            <Detail label={t("addWebsite.labelLabel")}>{website.label}</Detail>
          ) : null}
        </dl>
      </Card>

      <Card>
        <CardHeader title={t("websites.scanHistoryTitle")} />
        {scans.length === 0 ? (
          <EmptyState
            title={t("websites.scanHistoryTitle")}
            body={t("empty.noScansYet")}
          />
        ) : (
          <DataList
            caption={t("websites.scanHistoryTitle")}
            columns={scanColumns}
            rows={scans.map((scan): Row => ({
              id: scan.id,
              href: `/app/websites/${website.id}/scans/${scan.id}`,
              primary: scan.startedAt ? (
                <time dateTime={scan.startedAt.toISOString()}>
                  {formatDateTime(scan.startedAt, ctx.timezone)}
                </time>
              ) : (
                <span className="text-muted-foreground">{t("scans.queued")}</span>
              ),
              secondary: scan.trigger,
              cells: {
                outcome: <ScanStatusBadge status={scan.status} />,
                requests: (
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(scan.requestCount)}
                  </span>
                ),
                duration: (
                  <span className="tabular-nums text-muted-foreground">
                    {scan.durationMs
                      ? formatDuration(Math.round(scan.durationMs / 1000))
                      : "—"}
                  </span>
                ),
              },
            }))}
          />
        )}
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-small">{children}</dd>
    </div>
  );
}
