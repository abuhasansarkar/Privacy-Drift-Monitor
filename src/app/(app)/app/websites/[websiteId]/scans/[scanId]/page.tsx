import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Pagination } from "@/components/ui/pagination";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { LiveScanProgress } from "@/components/scans/live-scan-progress";
import {
  PartialScanBanner,
  ScanPhaseGrid,
  ScanStatusBadge,
} from "@/components/scans/scan-phases";
import { ConsentModeCard } from "@/components/scans/consent-mode-card";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getScanDetail, getScanRequests } from "@/server/queries/scans";

/**
 * SCAN DETAIL — §3.9, Phase 2 task 2.15.
 *
 * ⚠️ THE PARTIAL BANNER COMES FIRST, ABOVE THE EVIDENCE. A scan whose Reject-All
 * journey did not run must say so before the reader sees a request table with
 * nothing alarming in it — otherwise an incomplete recording reads as a clean
 * result, which is exactly what P5 forbids.
 *
 * ⚠️ Requests are PAGINATED. A busy site records thousands per scan; the page
 * shows one window and the count comes from the database.
 */

const PER_PAGE = 50;

export default async function ScanDetailPage({
  params,
  searchParams,
}: PageProps<"/app/websites/[websiteId]/scans/[scanId]">) {
  const { websiteId, scanId } = await params;
  const ctx = await requireWebsiteAccess(websiteId, "scan:read");

  const detail = await getScanDetail(ctx, scanId);
  // Also covers a scanId that belongs to another website — the tenant scope
  // made it reachable, the relationship check makes it correct.
  if (!detail || detail.scan.website.id !== websiteId) notFound();

  const { scan, phases } = detail;
  const raw = await searchParams;
  const page = Math.max(1, Number(Array.isArray(raw.page) ? raw.page[0] : raw.page) || 1);
  const requests = await getScanRequests(ctx, scanId, page, PER_PAGE);

  const columns: Column[] = [
    { key: "request", label: t("scans.columnRequest") },
    { key: "type", label: t("scans.columnType"), hideBelow: "lg" },
    { key: "phase", label: t("scans.columnConsentState") },
    { key: "status", label: t("scans.columnStatus"), align: "end" },
  ];

  const rows: Row[] = requests.items.map((request) => ({
    id: request.id,
    primary: <span className="font-mono text-mono break-all">{request.host}</span>,
    secondary: request.url.replace(/^https?:\/\/[^/]+/, "") || "/",
    cells: {
      type: <span className="text-muted-foreground">{request.resourceType}</span>,
      phase:
        request.consentPhase === "NO_CONSENT" ? (
          // The one state that carries a claim: this happened before anyone
          // was asked.
          <StatusBadge tone="warning" label={t("scans.beforeConsent")} />
        ) : (
          <MutedBadge>{request.consentPhase}</MutedBadge>
        ),
      status: (
        <span className="tabular-nums text-muted-foreground">
          {request.status ?? request.failureText ?? "—"}
        </span>
      ),
    },
  }));

  return (
    <div className="flex w-full flex-col gap-5">
      {/*
        A scan is three levels deep and reachable from an emailed link, so the
        browser's Back button is not a reliable way up — the reader may have no
        history at all. The trail names each level and links it.
      */}
      <Breadcrumbs
        items={[
          { label: t("websites.title"), href: "/app/websites" },
          {
            label: scan.website.url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
            href: `/app/websites/${websiteId}`,
          },
          {
            label: t("websiteTabs.scans"),
            href: `/app/websites/${websiteId}/scans`,
          },
          {
            label: scan.startedAt
              ? formatDateTime(scan.startedAt, ctx.timezone)
              : t("scans.title"),
          },
        ]}
      />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-h3 break-all">{scan.website.url}</span>
            <ScanStatusBadge status={scan.status} />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/app/websites/${websiteId}`}
              className="underline-offset-2 hover:underline"
            >
              {t("common.viewDetails")}
            </Link>
            <span aria-hidden="true">·</span>
            <span>{scan.trigger}</span>
            {scan.startedAt ? (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={scan.startedAt.toISOString()}>
                  {formatDateTime(scan.startedAt, ctx.timezone)}
                </time>
              </>
            ) : null}
            {scan.durationMs ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatDuration(Math.round(scan.durationMs / 1000))}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className="font-mono text-caption">v{scan.scannerVersion}</span>
          </span>
        }
      />

      {/*
        A scan still in flight shows the live pipeline instead of the evidence.
        There is no evidence yet, and rendering an empty request table beside a
        "0 requests" count would read as "we looked and found nothing" (P1).
      */}
      {scan.status === "QUEUED" || scan.status === "RUNNING" ? (
        <LiveScanProgress scanId={scan.id} initialStatus={scan.status} />
      ) : (
        <>
          {/* Before the evidence, always. See the note at the top of this file. */}
          <PartialScanBanner phases={phases} />
          <ScanPhaseGrid phases={phases} />
        </>
      )}

      {scan.detectedCmpName ? (
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("addWebsite.checkConsentBanner")}
          </p>
          <p className="mt-1 text-small font-medium">
            {t("outcome.detected")} — {scan.detectedCmpName}
            {scan.cmpConfidence !== null ? (
              // Confidence is part of the evidence: a generic-banner guess is
              // not the same claim as a known CMP, and the reader sees which.
              <span className="ms-2 text-muted-foreground">
                {Math.round(scan.cmpConfidence * 100)}%
              </span>
            ) : null}
          </p>
        </Card>
      ) : null}

      {scan.consentModeAudit ? (
        <ConsentModeCard audit={scan.consentModeAudit} />
      ) : null}

      {scan.status === "QUEUED" || scan.status === "RUNNING" ? null : (
      <Card>
        <CardHeader
          title={t("scans.requestsTitle")}
          action={
            <span className="text-caption text-muted-foreground tabular-nums">
              {formatNumber(requests.total)}
            </span>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t("scans.requestsTitle")}
            body={
              scan.status === "FAILED"
                ? t("empty.noEvidenceFailedScan")
                : t("empty.noRequestsRecorded")
            }
          />
        ) : (
          <DataList
            caption={t("scans.requestsTitle")}
            columns={columns}
            rows={rows}
            footer={
              <Pagination
                page={page}
                perPage={PER_PAGE}
                total={requests.total}
                params={raw}
              />
            }
          />
        )}
      </Card>
      )}
    </div>
  );
}
