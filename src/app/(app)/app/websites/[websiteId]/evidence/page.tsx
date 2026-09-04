import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { SCAN_STATUS_LABEL } from "@pdm/shared/copy/labels";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { EvidenceFilters } from "@/components/evidence/evidence-filters";
import { EvidenceTable } from "@/components/evidence/evidence-table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getEvidence, parseEvidenceFilters } from "@/server/queries/evidence";

/**
 * EVIDENCE TAB — §3.8, UI_DESIGN_PROMPTS §5.11, Phase 2 task 2.15.
 *
 * "The developer's tab", and deliberately the densest screen in the product.
 * Everything else in the app interprets; this shows the recording itself, which
 * is what makes a finding checkable rather than trusted.
 *
 * ⚠️ IT SHOWS WHAT WAS KEPT, AND SAYS WHAT WAS NOT. §10.6 strips query values,
 * cookie values and header values before storage. A developer looking for a
 * missing parameter needs to know it was never stored rather than concluding
 * the scanner missed it — hence the minimisation note, which is not decoration.
 *
 * ⚠️ EVERY CONTROL IS A URL PARAMETER. A filtered evidence view is the thing
 * one engineer sends another; component state would make it unsendable.
 */
export default async function EvidencePage({
  params,
  searchParams,
}: PageProps<"/app/websites/[websiteId]/evidence">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);

  const raw = await searchParams;
  const filters = parseEvidenceFilters(raw);
  const { scans, selected, resourceTypes, rows, total, perPage } = await getEvidence(
    ctx,
    websiteId,
    filters,
  );

  if (!selected) {
    return (
      <Card>
        <EmptyState title={t("evidence.noScans")} body={t("evidence.noScansBody")} />
      </Card>
    );
  }

  const base = `/app/websites/${websiteId}/evidence`;

  // The export mirrors the active filters — see the same rule on the audit log.
  const exportParams = new URLSearchParams();
  exportParams.set("scan", selected.id);
  exportParams.set("kind", filters.kind);
  for (const [key, value] of Object.entries({
    q: filters.search,
    phase: filters.consentPhase,
    type: filters.resourceType,
    thirdParty: filters.thirdPartyOnly ? "1" : undefined,
    tracker: filters.trackerOnly ? "1" : undefined,
  })) {
    if (value) exportParams.set(key, value);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={<span className="text-h3">{t("evidence.title")}</span>}
        subtitle={t("evidence.subtitle")}
        actions={
          /*
           * §3.8: "Export as JSON/CSV (permission-gated, audit-logged)." The
           * gate is `evidence:export`, not `website:read` — an export lifts a
           * client's full recording out of the product, which is a different
           * decision from looking at it.
           */
          can(ctx.role, "evidence:export") ? (
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/v1/websites/${websiteId}/evidence/export?${exportParams}&format=csv`}
                download
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-small font-medium hover:bg-muted max-sm:h-11"
              >
                {t("evidence.exportCsv")}
              </a>
              <a
                href={`/api/v1/websites/${websiteId}/evidence/export?${exportParams}&format=json`}
                download
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-small font-medium hover:bg-muted max-sm:h-11"
              >
                {t("evidence.exportJson")}
              </a>
            </div>
          ) : null
        }
      />

      {/* Scan selector — §5.11 puts it top-left, because evidence is only ever
          meaningful against one specific run. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-small">
          <span className="text-muted-foreground">{t("evidence.scanLabel")}</span>
          <ScanSelector base={base} scans={scans} selectedId={selected.id} kind={filters.kind} />
        </label>
        <StatusBadge
          tone={selected.status === "COMPLETED" ? "success" : selected.status === "PARTIAL" ? "warning" : "danger"}
          label={SCAN_STATUS_LABEL[selected.status]}
        />
        <span className="text-caption text-muted-foreground">
          {formatDateTime(selected.finishedAt ?? selected.createdAt, ctx.timezone)}
        </span>
        <span className="ms-auto text-caption text-muted-foreground">
          {formatNumber(total)}
        </span>
      </div>

      {/* Inner tab bar — Requests · Cookies · Storage · Console · Screenshots */}
      <nav aria-label={t("evidence.title")} className="-mx-1 overflow-x-auto border-b border-border px-1">
        <ul className="flex min-w-max gap-1">
          {(
            [
              ["requests", t("evidence.kindRequests")],
              ["cookies", t("evidence.kindCookies")],
              ["storage", t("evidence.kindStorage")],
              ["console", t("evidence.kindConsole")],
              ["screenshots", t("evidence.kindScreenshots")],
            ] as const
          ).map(([kind, label]) => (
            <li key={kind}>
              <Link
                href={`${base}?scan=${selected.id}&kind=${kind}`}
                aria-current={filters.kind === kind ? "page" : undefined}
                className={
                  filters.kind === kind
                    ? "-mb-px inline-block border-b-2 border-primary px-3 py-2 text-small font-medium"
                    : "-mb-px inline-block border-b-2 border-transparent px-3 py-2 text-small text-muted-foreground hover:text-foreground"
                }
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {filters.kind === "requests" ? (
        <EvidenceFilters
          scanId={selected.id}
          filters={filters}
          resourceTypes={resourceTypes}
        />
      ) : null}

      <Card>
        {rows === null || rows.items.length === 0 ? (
          <EmptyState title={t("evidence.emptyTitle")} body={t("evidence.emptyBody")} />
        ) : (
          <EvidenceTable
            rows={rows}
            timezone={ctx.timezone}
            page={filters.page}
            perPage={perPage}
            total={total}
            params={raw}
          />
        )}
      </Card>

      <p className="text-caption text-muted-foreground">
        {t("evidence.minimisationNote")}
      </p>
    </div>
  );
}

function ScanSelector({
  base,
  scans,
  selectedId,
  kind,
}: {
  base: string;
  scans: readonly { id: string; status: string; createdAt: Date; finishedAt: Date | null }[];
  selectedId: string;
  kind: string;
}) {
  /*
   * A list of links rather than a <select>: a select needs client JS to
   * navigate, and this page is otherwise entirely server-rendered. With 25
   * options a native dropdown of anchors is not available, so the compromise is
   * a small scrollable list — still linkable, still no client bundle.
   */
  return (
    <span className="flex max-w-full gap-1 overflow-x-auto">
      {scans.map((scan) => (
        <Link
          key={scan.id}
          href={`${base}?scan=${scan.id}&kind=${kind}`}
          aria-current={scan.id === selectedId ? "true" : undefined}
          className={
            scan.id === selectedId
              ? "whitespace-nowrap rounded-md bg-muted px-2 py-1 font-mono text-mono font-medium"
              : "whitespace-nowrap rounded-md px-2 py-1 font-mono text-mono text-muted-foreground hover:text-foreground"
          }
        >
          {(scan.finishedAt ?? scan.createdAt).toISOString().slice(0, 16).replace("T", " ")}
        </Link>
      ))}
      {scans.length === 0 ? <MutedBadge>{t("evidence.noScans")}</MutedBadge> : null}
    </span>
  );
}
