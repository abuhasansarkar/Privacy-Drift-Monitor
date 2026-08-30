import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ScanStatusBadge } from "@/components/scans/scan-phases";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getWebsiteScans } from "@/server/queries/scans";

/**
 * SCANS TAB — §3.6, Phase 3 task 3.10.
 *
 * ⚠️ EVERY OUTCOME IS SHOWN AS RECORDED. A PARTIAL scan is never collapsed into
 * a tick beside a COMPLETED one — the history is where a reader notices that
 * the Reject All journey has been failing for a fortnight, and a uniform green
 * column would hide exactly that (P5/P6).
 */
export default async function ScansTabPage({
  params,
}: PageProps<"/app/websites/[websiteId]/scans">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId, "scan:read");
  const scans = await getWebsiteScans(ctx, websiteId);

  const scanColumns: Column[] = [
    { key: "started", label: t("scans.columnStarted") },
    { key: "outcome", label: t("scans.columnStatus") },
    { key: "requests", label: t("scans.columnRequests"), align: "end" },
    { key: "duration", label: t("scans.columnDuration"), align: "end", hideBelow: "lg" },
  ];

  return (
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
              href: `/app/websites/${websiteId}/scans/${scan.id}`,
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
  );
}
