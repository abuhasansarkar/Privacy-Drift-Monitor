import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { AcknowledgeIssueButton } from "@/components/issues/issue-actions";
import { RescanButton } from "@/components/scans/start-scan-button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge, SeverityBadge } from "@/components/ui/severity-badge";
import { formatNumber, formatRelative } from "@/lib/format";
import type { AttentionItem } from "@/server/queries/attention";

/**
 * ATTENTION CENTER — §3.4 widget 2, UI_DESIGN_PROMPTS §5.1.
 *
 * "The most important component on the page." It answers the dashboard's whole
 * question — what needs my attention right now — in one list, deduplicated so
 * one troubled website occupies one row rather than four.
 *
 * ⚠️ THE EMPTY STATE IS A RESULT, NOT A BLANK. §3.4 specifies it word for word:
 * "Nothing needs your attention. 47 websites monitored." An agency paying for
 * monitoring needs to see that the monitoring ran and found nothing — an empty
 * card reads as a broken widget.
 *
 * ⚠️ SEVERITY IS DOT **PLUS** ICON **PLUS** TEXT (§11.6). The badge carries all
 * three; the row never relies on the colour.
 */

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  consent_regression: t("dashboard.kindConsentRegression"),
  critical_issue: t("dashboard.kindCriticalIssue"),
  scan_failing: t("dashboard.kindScanFailing"),
  new_tracker: t("dashboard.kindNewTracker"),
  stale: t("dashboard.kindStale"),
};

export function AttentionCenter({
  items,
  total,
  websitesMonitored,
  now,
  canAcknowledge,
  canRescan,
}: {
  items: readonly AttentionItem[];
  total: number;
  websitesMonitored: number;
  now: Date;
  canAcknowledge: boolean;
  canRescan: boolean;
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={t("dashboard.attentionCenter")}
        action={
          total > 0 ? (
            <MutedBadge>
              {formatNumber(total)} {t("dashboard.attentionItems")}
            </MutedBadge>
          ) : null
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title={t("dashboard.attentionEmpty")}
          body={t("dashboard.attentionEmptyDetail").replace(
            "{count}",
            formatNumber(websitesMonitored),
          )}
        />
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={item.severity} />
                  <span className="text-caption text-muted-foreground">
                    {KIND_LABEL[item.kind]}
                  </span>
                </div>

                <Link
                  href={item.href}
                  className="mt-1 block truncate font-mono text-mono font-medium hover:underline"
                >
                  {item.websiteLabel}
                </Link>
                <p className="truncate text-small text-muted-foreground">
                  {item.description}
                </p>
                {item.alsoCount > 0 ? (
                  // The dedupe is visible, not silent — otherwise the count in
                  // the header and the rows on screen disagree with no reason.
                  <p className="text-caption text-muted-foreground">
                    {t("dashboard.attentionAlso").replace(
                      "{count}",
                      formatNumber(item.alsoCount),
                    )}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <time
                  dateTime={item.at.toISOString()}
                  className="text-caption text-muted-foreground"
                >
                  {formatRelative(item.at, now)}
                </time>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={item.href}
                    className="rounded-md px-2 py-1 text-caption text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {t("dashboard.actionView")}
                  </Link>
                  {/*
                    §3.4 lists View · Acknowledge · Re-scan. Acknowledge only
                    applies to an issue; re-scan only to a website. Rendering a
                    dead button for the rows where neither applies would be a
                    control that does nothing.
                  */}
                  {canAcknowledge && item.issueId ? (
                    <AcknowledgeIssueButton issueId={item.issueId} />
                  ) : null}
                  {canRescan ? <RescanButton websiteId={item.websiteId} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
