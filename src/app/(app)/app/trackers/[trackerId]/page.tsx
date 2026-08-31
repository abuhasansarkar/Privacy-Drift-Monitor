import Link from "next/link";
import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import {
  CONSENT_PHASE_LABEL,
  RISK_LABEL,
  TRACKER_CATEGORY_LABEL,
} from "@pdm/shared/copy/labels";
import { Card, CardHeader } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";

/**
 * TRACKER DETAIL — §3.11, Phase 3 task 3.13.
 *
 * "Vendor profile (domains, cookies, scripts, documentation link), all agency
 * websites where it appears with consent-state breakdown, timeline of when it
 * appeared on each."
 *
 * ⚠️ THE VENDOR CATALOGUE IS GLOBAL; THE DETECTIONS ARE NOT. The profile is
 * shared reference data every agency sees identically; which of THEIR websites
 * it appears on is tenant data and goes through `repositoriesFor`. Mixing the
 * two scopes in one query is how one agency learns which sites another agency
 * monitors.
 *
 * ⚠️ ONLY THE LATEST SCAN OF EACH SITE COUNTS — the same rule as the inventory
 * page. Aggregating history would keep reporting a vendor the agency removed
 * six months ago.
 */

const catalogue = unsafeGlobalClient(
  // Justification (required in review): `TrackerVendor` is a GLOBAL reference
  // table shared by every agency. Every tenant-owned read below goes through
  // `repositoriesFor`.
  "the tracker vendor catalogue is global reference data, not tenant data",
);

export default async function TrackerDetailPage({
  params,
}: PageProps<"/app/trackers/[trackerId]">) {
  const { trackerId } = await params;
  const ctx = await requirePermission("website:read");

  const vendor = await catalogue.trackerVendor.findFirst({
    where: { OR: [{ id: trackerId }, { slug: trackerId }] },
  });

  if (!vendor) {
    // An unknown third party has no catalogue row — it is identified by domain
    // on the inventory page and has no profile to show.
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader title={t("trackerInventory.notFound")} />
        <Card>
          <EmptyState
            title={t("trackerInventory.notFound")}
            body={t("trackerInventory.notFoundBody")}
          />
        </Card>
      </div>
    );
  }

  const { db } = repositoriesFor(ctx.agencyId);

  const websites = await db.website.findMany({
    where: { archivedAt: null, lastScanId: { not: null } },
    select: { id: true, url: true, label: true, lastScanId: true, client: { select: { name: true } } },
  });
  const latestScanIds = websites
    .map((website) => website.lastScanId)
    .filter((id): id is string => id !== null);

  const [current, firstSeen] = await Promise.all([
    latestScanIds.length > 0
      ? db.trackerDetection.findMany({
          where: { vendorId: vendor.id, scanId: { in: latestScanIds } },
          select: { websiteId: true, consentPhase: true, requestCount: true },
        })
      : Promise.resolve([]),
    // The timeline: the EARLIEST detection per website, across all history.
    db.trackerDetection.groupBy({
      by: ["websiteId"],
      where: { vendorId: vendor.id },
      _min: { createdAt: true },
    }),
  ]);

  const firstSeenByWebsite = new Map(
    firstSeen.map((row) => [row.websiteId, row._min.createdAt]),
  );
  const websiteById = new Map(websites.map((website) => [website.id, website]));

  interface SiteRollup {
    websiteId: string;
    phases: Set<string>;
    requests: number;
  }

  const rollups = new Map<string, SiteRollup>();
  for (const detection of current) {
    const entry = rollups.get(detection.websiteId) ?? {
      websiteId: detection.websiteId,
      phases: new Set<string>(),
      requests: 0,
    };
    entry.phases.add(detection.consentPhase);
    entry.requests += detection.requestCount;
    rollups.set(detection.websiteId, entry);
  }

  const columns: Column[] = [
    { key: "website", label: t("evidence.columnUrl") },
    { key: "phases", label: t("trackerInventory.columnPhases") },
    { key: "requests", label: t("trackers.columnRequests"), align: "end", hideBelow: "lg" },
    { key: "firstSeen", label: t("trackerInventory.columnFirstSeen"), align: "end" },
  ];

  const rows: Row[] = [...rollups.values()]
    // Pre-consent sites first — the ones that need action.
    .sort(
      (a, b) =>
        Number(b.phases.has("NO_CONSENT")) - Number(a.phases.has("NO_CONSENT")) ||
        b.requests - a.requests,
    )
    .map((rollup) => {
      const website = websiteById.get(rollup.websiteId);
      const seen = firstSeenByWebsite.get(rollup.websiteId);
      return {
        id: rollup.websiteId,
        href: `/app/websites/${rollup.websiteId}/trackers`,
        primary: (
          <span className="font-mono text-mono">
            {website?.url.replace(/^https?:\/\//, "") ?? rollup.websiteId}
          </span>
        ),
        secondary: website?.client?.name ?? undefined,
        cells: {
          website: null,
          phases: (
            <span className="flex flex-wrap gap-1.5">
              {rollup.phases.has("NO_CONSENT") ? (
                // ⚠️ Colour PLUS the words (§11.6). "Before consent" is the
                // whole reason this column exists.
                <StatusBadge tone="danger" label={t("evidence.beforeConsent")} />
              ) : null}
              {[...rollup.phases]
                .filter((phase) => phase !== "NO_CONSENT")
                .map((phase) => (
                  <MutedBadge key={phase}>
                    {CONSENT_PHASE_LABEL[phase as keyof typeof CONSENT_PHASE_LABEL]}
                  </MutedBadge>
                ))}
            </span>
          ),
          requests: (
            <span className="tabular-nums text-muted-foreground">
              {formatNumber(rollup.requests)}
            </span>
          ),
          firstSeen: seen ? (
            <time dateTime={seen.toISOString()} className="text-muted-foreground">
              {formatDate(seen, ctx.timezone)}
            </time>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        },
      };
    });

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={vendor.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <MutedBadge>{TRACKER_CATEGORY_LABEL[vendor.category]}</MutedBadge>
            <MutedBadge>
              {t("trackerInventory.columnRisk")}: {RISK_LABEL[vendor.riskLevel]}
            </MutedBadge>
            {vendor.vendorCompany ? (
              <span className="text-muted-foreground">
                {t("trackerInventory.company")} {vendor.vendorCompany}
              </span>
            ) : null}
          </span>
        }
      />

      {vendor.isEssentialCandidate ? (
        <Card className="p-4">
          {/*
            Worth stating loudly: this flag is why a pre-consent detection for
            this vendor is not reported as critical. Without the note, the
            absence of a finding looks like a miss.
          */}
          <p className="text-small text-muted-foreground">
            {t("trackerInventory.essentialNote")}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t("trackerInventory.vendorProfile")} />
          <dl className="flex flex-col gap-3 p-4">
            <Patterns label={t("trackerInventory.domains")} values={vendor.domainPatterns} />
            <Patterns label={t("trackerInventory.scripts")} values={vendor.scriptPatterns} />
            <Patterns
              label={t("trackerInventory.cookiePatterns")}
              values={vendor.cookiePatterns}
            />
            {vendor.dataProcessingLocation ? (
              <div>
                <dt className="text-caption text-muted-foreground">
                  {t("trackerInventory.processingLocation")}
                </dt>
                <dd className="mt-0.5 text-small">{vendor.dataProcessingLocation}</dd>
              </div>
            ) : null}
            {vendor.documentationUrl || vendor.privacyPolicyUrl ? (
              <div className="flex flex-wrap gap-3">
                {vendor.documentationUrl ? (
                  <a
                    href={vendor.documentationUrl}
                    // Third-party link from reference data: opened in a new tab,
                    // and `noreferrer` so the vendor learns nothing about us.
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-small text-primary hover:underline"
                  >
                    {t("trackerInventory.documentation")}
                  </a>
                ) : null}
                {vendor.privacyPolicyUrl ? (
                  <a
                    href={vendor.privacyPolicyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-small text-primary hover:underline"
                  >
                    {t("trackerInventory.privacyPolicy")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t("trackerInventory.whereItAppears")}
            action={
              <Link href="/app/trackers" className="text-small text-primary hover:underline">
                {t("trackerInventory.title")}
              </Link>
            }
          />
          {rows.length === 0 ? (
            <EmptyState
              title={t("trackerInventory.whereItAppears")}
              body={t("trackerInventory.noDetections")}
            />
          ) : (
            <DataList
              caption={t("trackerInventory.whereItAppears")}
              columns={columns}
              rows={rows}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function Patterns({ label, values }: { label: string; values: readonly string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap gap-1">
        {values.slice(0, 12).map((value) => (
          <code key={value} className="rounded bg-muted px-1.5 py-0.5 font-mono text-mono">
            {value}
          </code>
        ))}
      </dd>
    </div>
  );
}
