import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import { HealthScore } from "@/components/ui/health-score";
import { MutedBadge, SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { cn } from "@/lib/cn";
import { formatNumber, formatRelative } from "@/lib/format";
import { MONITORING_LABEL, MONITORING_TONE } from "@/lib/labels";
import type { MonitoringStatus } from "@pdm/schemas";

/**
 * WEBSITE GRID — §3.5, UI_DESIGN_PROMPTS §5.3.
 *
 * "Better for small portfolios and for visual recognition" (§3.5). The table
 * stays the default because an account manager scanning twenty sites wants
 * columns; the grid is for recognising a client's site at a glance.
 *
 * ⚠️ NO SCREENSHOT THUMBNAIL, DELIBERATELY. §5.3 draws one, and we do capture
 * screenshots — but they live in a private bucket and are only ever served
 * through short-lived signed URLs (§10.7). Rendering twenty of them here would
 * mean minting twenty credentials per page load, for decoration. The score ring
 * and the status carry the same recognition value without that trade.
 *
 * ⚠️ A FAILED SITE IS TINTED **AND** LABELLED (§11.6). §5.3 asks for a
 * red-tinted card; the tint is the second signal, never the only one.
 */

export interface WebsiteCard {
  id: string;
  url: string;
  label: string | null;
  clientName: string | null;
  healthScore: number | null;
  monitoringStatus: MonitoringStatus;
  openIssueCount: number;
  criticalIssueCount: number;
  lastScanAt: Date | null;
  archived: boolean;
}

export function WebsiteGrid({
  sites,
  now,
  footer,
}: {
  sites: readonly WebsiteCard[];
  /** Passed in so every card formats against one instant and stays testable. */
  now: Date;
  footer?: ReactNode;
}) {
  return (
    <div>
      <ul className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sites.map((site) => {
          const failing = site.monitoringStatus === "ERROR";
          return (
            <li key={site.id}>
              <Link
                href={`/app/websites/${site.id}`}
                className={cn(
                  "flex h-full flex-col gap-3 rounded-lg border p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 hover:bg-muted/30",
                  failing ? "border-danger/40 bg-danger-muted/40" : "border-border",
                  (site.archived || site.monitoringStatus === "PAUSED") && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-mono font-medium">
                      {site.url.replace(/^https?:\/\//, "")}
                    </p>
                    <p className="mt-0.5 truncate text-caption text-muted-foreground">
                      {site.label ?? site.clientName ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-h4">
                    <HealthScore score={site.healthScore} />
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={MONITORING_TONE[site.monitoringStatus]}
                    label={MONITORING_LABEL[site.monitoringStatus]}
                  />
                  {site.criticalIssueCount > 0 ? (
                    <SeverityBadge severity="CRITICAL" count={site.criticalIssueCount} />
                  ) : null}
                  {site.openIssueCount > site.criticalIssueCount ? (
                    <MutedBadge>
                      {formatNumber(site.openIssueCount - site.criticalIssueCount)}
                    </MutedBadge>
                  ) : null}
                </div>

                <p className="text-caption text-muted-foreground">
                  {site.lastScanAt ? (
                    <>
                      {t("websites.scannedRelative")}{" "}
                      <time dateTime={site.lastScanAt.toISOString()}>
                        {formatRelative(site.lastScanAt, now)}
                      </time>
                    </>
                  ) : (
                    t("websites.neverScanned")
                  )}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {footer ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The table/grid segmented control.
 *
 * ⚠️ REAL LINKS, NOT STATE. §3.5 serialises every list control into the URL so
 * a view is shareable and back-navigable; the view mode is part of that view.
 */
export function ViewToggle({
  view,
  params,
}: {
  view: "table" | "grid";
  params: Record<string, string | string[] | undefined>;
}) {
  const hrefFor = (target: "table" | "grid") => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = Array.isArray(value) ? value[0] : value;
      if (single !== undefined && key !== "view") next.set(key, single);
    }
    // `table` is the default, so it is expressed by the parameter's ABSENCE —
    // otherwise every shared link carries a redundant `?view=table`.
    if (target === "grid") next.set("view", "grid");
    const query = next.toString();
    return query ? `/app/websites?${query}` : "/app/websites";
  };

  return (
    <div
      role="group"
      aria-label={t("websites.viewToggle")}
      className="inline-flex overflow-hidden rounded-md border border-border"
    >
      {(["table", "grid"] as const).map((target) => (
        <Link
          key={target}
          href={hrefFor(target)}
          aria-current={view === target ? "true" : undefined}
          className={cn(
            "px-3 py-1.5 text-caption font-medium transition-colors",
            view === target
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {target === "table" ? t("websites.viewTable") : t("websites.viewGrid")}
        </Link>
      ))}
    </div>
  );
}
