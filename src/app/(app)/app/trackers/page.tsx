import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";

/**
 * PORTFOLIO TRACKER INVENTORY — §3.13, UI_DESIGN_PROMPTS §5.18, Phase 3 task 3.13.
 *
 * The question this page answers is not "what is on this site" — that is the
 * website's Trackers tab. It is the PORTFOLIO question: "we are switching
 * analytics vendor; which of our 47 clients still has the old one?" That is a
 * one-query answer here and an afternoon of clicking without it.
 *
 * ⚠️ COUNTED PER WEBSITE, NOT PER DETECTION. A vendor firing forty times on one
 * site is one site, not forty — a request-count ranking would put a chatty
 * script above a vendor deployed across the whole portfolio, which is the
 * opposite of what this page is for.
 *
 * ⚠️ ONLY THE LATEST SCAN OF EACH SITE COUNTS. Aggregating every historical
 * detection would keep reporting a vendor an agency removed six months ago.
 */
export default async function TrackerInventoryPage() {
  const ctx = await requirePermission("website:read");
  const { db } = repositoriesFor(ctx.agencyId);

  // The scan each website is currently represented by.
  const websites = await db.website.findMany({
    where: { archivedAt: null, lastScanId: { not: null } },
    select: { id: true, lastScanId: true },
  });
  const latestScanIds = websites
    .map((website) => website.lastScanId)
    .filter((id): id is string => id !== null);

  if (latestScanIds.length === 0) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader title={t("trackerInventory.title")} />
        <Card>
          <EmptyState
            title={t("trackerInventory.title")}
            body={t("empty.noScansYet")}
          />
        </Card>
      </div>
    );
  }

  const detections = await db.trackerDetection.findMany({
    where: { scanId: { in: latestScanIds } },
    select: {
      websiteId: true,
      consentPhase: true,
      unknownDomain: true,
      vendor: {
        select: { id: true, name: true, category: true, riskLevel: true },
      },
    },
  });

  /*
   * Rolled up in memory rather than with a `groupBy`: the interesting number —
   * "on how many sites does this fire BEFORE consent" — is a conditional count
   * across two dimensions, which Prisma's groupBy cannot express in one query.
   * The input is one row per vendor per phase per site, which is small.
   */
  interface Rollup {
    key: string;
    name: string;
    category: string;
    riskLevel: string | null;
    sites: Set<string>;
    preConsentSites: Set<string>;
    known: boolean;
  }

  const rollups = new Map<string, Rollup>();
  for (const detection of detections) {
    const key = detection.vendor?.id ?? `unknown:${detection.unknownDomain}`;
    const entry = rollups.get(key) ?? {
      key,
      name: detection.vendor?.name ?? detection.unknownDomain ?? "—",
      category: detection.vendor?.category ?? t("trackers.unknown"),
      riskLevel: detection.vendor?.riskLevel ?? null,
      sites: new Set<string>(),
      preConsentSites: new Set<string>(),
      known: detection.vendor !== null,
    };
    entry.sites.add(detection.websiteId);
    if (detection.consentPhase === "NO_CONSENT") {
      entry.preConsentSites.add(detection.websiteId);
    }
    rollups.set(key, entry);
  }

  const rows: Row[] = [...rollups.values()]
    // Pre-consent reach first: the vendor on eleven sites before consent is the
    // one to deal with, whatever its alphabetical position.
    .sort(
      (a, b) =>
        b.preConsentSites.size - a.preConsentSites.size ||
        b.sites.size - a.sites.size,
    )
    .map((rollup) => ({
      id: rollup.key,
      primary: rollup.name,
      secondary: rollup.known ? rollup.category : t("trackers.unknownVendors"),
      cells: {
        sites: (
          <span className="tabular-nums">{formatNumber(rollup.sites.size)}</span>
        ),
        preConsent:
          rollup.preConsentSites.size > 0 ? (
            <StatusBadge
              tone="warning"
              label={`${formatNumber(rollup.preConsentSites.size)} ${t("trackerInventory.sites")}`}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        risk: rollup.riskLevel ? (
          <MutedBadge>{rollup.riskLevel}</MutedBadge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      },
    }));

  const columns: Column[] = [
    { key: "vendor", label: t("trackers.columnVendor") },
    { key: "sites", label: t("trackerInventory.columnSites"), align: "end" },
    { key: "preConsent", label: t("trackerInventory.columnPreConsent") },
    { key: "risk", label: t("trackerInventory.columnRisk"), hideBelow: "lg" },
  ];

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("trackerInventory.title")}
        subtitle={`${formatNumber(rows.length)} ${t("trackerInventory.acrossPortfolio")}`}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("trackerInventory.title")}
            body={t("empty.noTrackers")}
          />
        ) : (
          <DataList
            caption={t("trackerInventory.title")}
            columns={columns}
            rows={rows}
          />
        )}
      </Card>
    </div>
  );
}
