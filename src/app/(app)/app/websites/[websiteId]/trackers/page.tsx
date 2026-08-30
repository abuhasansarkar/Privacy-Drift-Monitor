import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { ScanContextNote } from "@/components/websites/scan-context-note";
import { formatNumber } from "@/lib/format";
import { CONSENT_PHASE_LABEL } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getTrackersTab } from "@/server/queries/website-tabs";

/**
 * TRACKERS TAB — UI_DESIGN_PROMPTS §5.7, Phase 3 task 3.10.
 *
 * ⚠️ "First seen under" IS THE COLUMN THAT MATTERS. §5.7 puts it mid-table with
 * a red chip for "Before consent"; everything else on this screen is context
 * for that one value. A tracker present after Accept All is expected; the same
 * tracker before consent is the finding.
 *
 * ⚠️ UNKNOWN VENDORS ARE LISTED, NOT HIDDEN. A third party we cannot name is
 * still a third party the site contacted, and dropping it would make the page
 * look cleaner than the recording.
 */
export default async function TrackersTabPage({
  params,
}: PageProps<"/app/websites/[websiteId]/trackers">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);
  const { scan, detections } = await getTrackersTab(ctx, websiteId);

  if (!scan) {
    return (
      <Card>
        <EmptyState title={t("websiteTabs.trackers")} body={t("empty.noScansYet")} />
      </Card>
    );
  }

  const known = detections.filter((detection) => detection.vendor !== null);
  const unknown = detections.filter((detection) => detection.vendor === null);

  const columns: Column[] = [
    { key: "vendor", label: t("trackers.columnVendor") },
    { key: "category", label: t("trackers.columnCategory"), hideBelow: "lg" },
    { key: "phase", label: t("trackers.columnFirstSeenUnder") },
    { key: "requests", label: t("trackers.columnRequests"), align: "end", hideBelow: "lg" },
    { key: "confidence", label: t("trackers.columnConfidence"), align: "end" },
  ];

  const toRow = (detection: (typeof detections)[number]): Row => ({
    id: detection.id,
    primary: detection.vendor?.name ?? detection.unknownDomain ?? "—",
    secondary: detection.matchedVia,
    cells: {
      category: (
        <MutedBadge>{detection.vendor?.category ?? t("trackers.unknown")}</MutedBadge>
      ),
      phase:
        detection.consentPhase === "NO_CONSENT" ? (
          <StatusBadge tone="warning" label={t("scans.beforeConsent")} />
        ) : (
          <MutedBadge>{CONSENT_PHASE_LABEL[detection.consentPhase]}</MutedBadge>
        ),
      requests: (
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(detection.requestCount)}
        </span>
      ),
      confidence: (
        <span className="flex items-center justify-end gap-2 tabular-nums">
          {/*
            Corroboration is shown, not just the number: a 95% single-signal
            match and a 95% two-signal match are different claims, and only the
            second may ever support a Critical finding (§4.8).
          */}
          {detection.corroborated ? (
            <MutedBadge>{t("trackers.corroborated")}</MutedBadge>
          ) : null}
          <span className="text-muted-foreground">
            {Math.round(detection.confidence * 100)}%
          </span>
        </span>
      ),
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <ScanContextNote scan={scan} timezone={ctx.timezone} websiteId={websiteId} />

      <Card>
        {known.length === 0 ? (
          <EmptyState
            title={t("websiteTabs.trackers")}
            body={t("empty.noTrackers")}
          />
        ) : (
          <DataList
            caption={t("websiteTabs.trackers")}
            columns={columns}
            rows={known.map(toRow)}
          />
        )}
      </Card>

      {unknown.length > 0 ? (
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {t("trackers.unknownVendors")} ({formatNumber(unknown.length)})
            </h2>
            <p className="mt-1 text-small text-muted-foreground">
              {t("trackers.unknownBody")}
            </p>
          </div>
          <DataList
            caption={t("trackers.unknownVendors")}
            columns={columns}
            rows={unknown.map(toRow)}
          />
        </Card>
      ) : null}
    </div>
  );
}
