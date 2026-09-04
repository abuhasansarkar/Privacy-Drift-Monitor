import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { HealthScore } from "@/components/ui/health-score";
import { MutedBadge, SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { HealthTrend } from "@/components/dashboard/health-trend";
import { ScanStatusBadge } from "@/components/scans/scan-phases";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { FREQUENCY_LABEL, MONITORING_LABEL, MONITORING_TONE } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import {
  getWebsiteDetail,
  getWebsiteHealthTrend,
  getWebsiteRecentScans,
  getWebsiteTopIssues,
} from "@/server/queries/detail";

/**
 * WEBSITE DETAIL — OVERVIEW TAB — §3.6, UI_DESIGN_PROMPTS §5.6.
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

  const [website, trendPoints, recentScans, topIssues] = await Promise.all([
    getWebsiteDetail(ctx, websiteId),
    getWebsiteHealthTrend(ctx, websiteId),
    getWebsiteRecentScans(ctx, websiteId, 5),
    getWebsiteTopIssues(ctx, websiteId, 5),
  ]);
  if (!website) notFound();

  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
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
          {/*
            ⚠️ ONLY WHEN IT DIFFERS. "Address as entered" exists to show what
            normalization changed — a missing scheme, a stripped `www.`, a
            trailing slash. When nothing changed it printed the SAME string
            under a second label, which does not inform anyone and makes the
            reader look for a difference that is not there.
          */}
          {website.originalUrl !== website.url ? (
            <Detail label={t("websites.originalUrlLabel")}>
              <span className="font-mono text-mono break-all">
                {website.originalUrl}
              </span>
            </Detail>
          ) : null}
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

      {/* 30-Day Health Trend */}
      <Card>
        <CardHeader
          title={t("dashboard.healthTrend")}
          action={
            <span className="text-caption text-muted-foreground">
              Last 30 days
            </span>
          }
        />
        <div className="p-4">
          <HealthTrend points={trendPoints} />
        </div>
      </Card>

      {/* Recent Scans & Open Potential Issues Overview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("websites.scanHistoryTitle")}
            action={
              <Link
                href={`/app/websites/${websiteId}/scans`}
                className="text-caption font-medium text-primary hover:underline"
              >
                View all scans →
              </Link>
            }
          />
          {recentScans.length === 0 ? (
            <p className="p-4 text-small text-muted-foreground">
              {t("empty.noScansYet")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recentScans.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/app/websites/${websiteId}/scans/${scan.id}`}
                    className="flex items-center justify-between p-3.5 transition hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-small font-medium">
                        {scan.startedAt ? (
                          <time dateTime={scan.startedAt.toISOString()}>
                            {formatDateTime(scan.startedAt, ctx.timezone)}
                          </time>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("scans.queued")}
                          </span>
                        )}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {scan.trigger} · {formatNumber(scan.requestCount)} requests
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {scan.healthScore !== null ? (
                        <span className="font-mono text-caption tabular-nums">
                          Score {scan.healthScore}
                        </span>
                      ) : null}
                      <ScanStatusBadge status={scan.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t("dashboard.openIssues")}
            action={
              <Link
                href={`/app/websites/${websiteId}/issues`}
                className="text-caption font-medium text-primary hover:underline"
              >
                View all issues →
              </Link>
            }
          />
          {topIssues.length === 0 ? (
            <p className="p-4 text-small text-muted-foreground">
              {t("empty.noIssues")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {topIssues.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={`/app/issues/${issue.id}`}
                    className="flex items-center justify-between p-3.5 transition hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="truncate text-small font-medium">
                        {issue.title}
                      </span>
                      <span className="font-mono text-caption text-muted-foreground">
                        {issue.ruleId} · {formatRelative(issue.lastSeenAt, now)}
                      </span>
                    </div>
                    <div className="shrink-0">
                      <SeverityBadge severity={issue.severity} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
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
