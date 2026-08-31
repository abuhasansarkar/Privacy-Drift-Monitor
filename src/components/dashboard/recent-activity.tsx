import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import type { ActivityItem } from "@/server/queries/activity";

/**
 * RECENT ACTIVITY — §3.4 widget 6, UI_DESIGN_PROMPTS §5.1.
 *
 * A timeline of what the system and the team have done. Its job on a healthy
 * portfolio is reassurance: the Attention Center being empty is only good news
 * if something is visibly still running.
 *
 * ⚠️ THE KIND LABEL COMES FROM THE COPY FILE, not from the raw action string.
 * `issue.status_changed` is our vocabulary, not the reader's.
 */

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  scan_completed: t("dashboard.activityScanCompleted"),
  scan_partial: t("dashboard.activityScanPartial"),
  scan_failed: t("dashboard.activityScanFailed"),
  issue_resolved: t("dashboard.activityIssueResolved"),
  issue_ignored: t("dashboard.activityIssueIgnored"),
  website_added: t("dashboard.activityWebsiteAdded"),
  report_generated: t("dashboard.activityReportGenerated"),
  member_joined: t("dashboard.activityMemberJoined"),
  other: t("dashboard.activityOther"),
};

/** Muted for everything: an activity feed reports, it does not judge. */
const TONE: Record<ActivityItem["kind"], string> = {
  scan_completed: "bg-success",
  scan_partial: "bg-warning",
  scan_failed: "bg-danger",
  issue_resolved: "bg-success",
  issue_ignored: "bg-muted-foreground",
  website_added: "bg-primary",
  report_generated: "bg-primary",
  member_joined: "bg-primary",
  other: "bg-muted-foreground",
};

export function RecentActivity({
  items,
  now,
}: {
  items: readonly ActivityItem[];
  now: Date;
}) {
  return (
    <Card>
      <CardHeader title={t("dashboard.recentActivity")} />

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-small text-muted-foreground">
          {t("dashboard.recentActivityEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE[item.kind]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small">
                    {KIND_LABEL[item.kind]}
                    {item.detail ? (
                      <span className="text-muted-foreground"> · {item.detail}</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {item.summary}
                    {item.actor ? ` · ${item.actor}` : ""}
                  </span>
                </span>
                <time
                  dateTime={item.at.toISOString()}
                  className="shrink-0 text-caption text-muted-foreground"
                >
                  {formatRelative(item.at, now)}
                </time>
              </>
            );

            return (
              <li key={item.id} className="border-b border-border last:border-b-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted"
                  >
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-start gap-2.5 px-4 py-2.5">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
