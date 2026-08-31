import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { NOTIFICATION_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { MarkAllReadButton, MarkReadOnVisit } from "@/components/notifications/notification-actions";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterForm, SelectField } from "@/components/ui/filter-form";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { cn } from "@/lib/cn";
import { formatNumber, formatRelative } from "@/lib/format";
import { requireAgencyContext } from "@/server/auth/context";
import { getNotificationList } from "@/server/queries/notifications";

/**
 * NOTIFICATION CENTRE — §3.11, UI_DESIGN_PROMPTS §5.22.
 *
 * ⚠️ CURSOR-PAGINATED (§6.3). The stream is unbounded and time-ordered; offset
 * paging drifts as new rows land while you read page two, so items repeat and
 * others vanish.
 *
 * ⚠️ AN UNREAD ROW CARRIES A TINT **AND** A DOT **AND** ITS TYPE. §11.6 forbids
 * conveying state by colour alone, and a faint blue tint is precisely the
 * signal a colour-blind reader loses.
 */
export default async function NotificationsPage({
  searchParams,
}: PageProps<"/app/notifications">) {
  const ctx = await requireAgencyContext();
  const raw = await searchParams;
  const { query, page, unread } = await getNotificationList(ctx, raw);

  const now = new Date();
  const unreadOnly = query.unreadOnly;

  const nextHref = page.nextCursor
    ? `/app/notifications?${new URLSearchParams({
        ...(unreadOnly ? { unread: "1" } : {}),
        ...(query.type ? { type: query.type } : {}),
        cursor: page.nextCursor,
      }).toString()}`
    : null;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        actions={<MarkAllReadButton disabled={unread === 0} />}
      />

      {/* Tabs are links, so a filtered view is a shareable, back-navigable URL. */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabLink href="/app/notifications?unread=1" active={unreadOnly}>
          {t("notifications.tabUnread")}
          {unread > 0 ? ` (${formatNumber(unread)})` : ""}
        </TabLink>
        <TabLink href="/app/notifications" active={!unreadOnly}>
          {t("notifications.tabAll")}
        </TabLink>
      </div>

      <FilterForm clearHref={query.type ? "/app/notifications" : undefined}>
        {unreadOnly ? <input type="hidden" name="unread" value="1" /> : null}
        <SelectField
          name="type"
          label={t("notifications.filterType")}
          defaultValue={query.type}
          options={[
            { value: "", label: t("notifications.allTypes") },
            ...Object.entries(NOTIFICATION_TYPE_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </FilterForm>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title={unreadOnly ? t("notifications.emptyUnreadTitle") : t("notifications.emptyAllTitle")}
            body={unreadOnly ? t("notifications.emptyUnreadBody") : t("notifications.emptyAllBody")}
          />
        ) : (
          <ul>
            {page.items.map((row) => {
              const isUnread = row.readAt === null;
              return (
                <li
                  key={row.id}
                  className={cn(
                    "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0",
                    isUnread && "bg-primary/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={row.severity} />
                      <span className="text-caption text-muted-foreground">
                        {NOTIFICATION_TYPE_LABEL[row.type]}
                      </span>
                    </div>
                    {row.linkUrl ? (
                      <Link
                        href={row.linkUrl}
                        className="mt-1 block truncate font-medium hover:underline"
                      >
                        {row.title}
                      </Link>
                    ) : (
                      <p className="mt-1 truncate font-medium">{row.title}</p>
                    )}
                    <p className="text-small text-muted-foreground">{row.body}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <time
                      dateTime={row.createdAt.toISOString()}
                      className="text-caption text-muted-foreground"
                    >
                      {formatRelative(row.createdAt, now)}
                    </time>
                    {isUnread ? <MarkReadOnVisit id={row.id} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {nextHref ? (
          <div className="border-t border-border px-4 py-2.5">
            <Link href={nextHref} className="text-small text-primary hover:underline">
              {t("notifications.loadMore")}
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-small transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
