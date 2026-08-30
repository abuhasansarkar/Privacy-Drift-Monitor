import Link from "next/link";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { DRIFT_CHANGE_LABEL } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";

/**
 * PRIVACY DRIFT FEED — §3.11, UI_DESIGN_PROMPTS §5.14, Phase 3 task 3.11.
 *
 * ⚠️ A TIMELINE, NOT A TABLE. §5.14 is explicit, and the reason is the job it
 * does: an agency reads this to answer "what changed, and when did it start" —
 * a chronological question. A sortable table invites sorting by severity, which
 * destroys the one axis that makes the feed useful.
 *
 * ⚠️ An empty feed is GOOD NEWS and says so. "No changes detected" is a real
 * result here — unlike an empty issue list, which could mean nothing has been
 * scanned yet.
 */
const DAYS = 30;

export default async function DriftPage() {
  const ctx = await requirePermission("issue:read");
  const repos = repositoriesFor(ctx.agencyId);

  // Captured once, before any awaits that could split the render: the window
  // boundary must be a single instant, not a moving one.
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 24 * 3600 * 1000);
  const events = await repos.db.privacyDriftEvent.findMany({
    where: { detectedAt: { gte: since } },
    orderBy: { detectedAt: "desc" },
    take: 200,
    include: { website: { select: { id: true, url: true } } },
  });

  // Grouped by calendar day in the AGENCY's timezone, not UTC: "Today" has to
  // mean today where the reader is, or the sticky headers are off by a day for
  // half the portfolio.
  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const key = formatDate(event.detectedAt, ctx.timezone);
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={t("drift.title")}
        subtitle={`${formatNumber(events.length)} ${t("drift.eventsIn")} ${DAYS} ${t("drift.days")}`}
      />

      {events.length === 0 ? (
        <Card>
          <EmptyState title={t("drift.title")} body={t("empty.noDrift")} />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {[...byDay.entries()].map(([day, dayEvents]) => (
            <section key={day} className="flex flex-col gap-3">
              <h2 className="sticky top-0 z-10 -mx-1 bg-canvas/90 px-1 py-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {day}
                <span className="ms-2 font-normal normal-case tracking-normal">
                  {new Set(dayEvents.map((event) => event.websiteId)).size}{" "}
                  {t("drift.websitesChanged")} · {dayEvents.length} {t("drift.events")}
                </span>
              </h2>

              {/* The rail: a vertical line with a node per event (§5.14). */}
              <ol className="flex flex-col gap-3 border-s border-border ps-4">
                {dayEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -start-[1.3125rem] top-3 size-2 rounded-full bg-border ring-4 ring-canvas"
                    />
                    <Card className="p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={event.severity} />
                        <span className="text-caption font-medium text-muted-foreground">
                          {DRIFT_CHANGE_LABEL[event.changeType]}
                        </span>
                        <Link
                          href={`/app/websites/${event.website.id}`}
                          className="ms-auto font-mono text-mono text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {event.website.url.replace(/^https?:\/\//, "")}
                        </Link>
                      </div>

                      <p className="mt-1.5 text-small font-medium">{event.summary}</p>

                      {/* before → after, the inline diff §5.14 specifies. */}
                      {event.beforeValue || event.afterValue ? (
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-mono">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {String(event.beforeValue ?? "—")}
                          </span>
                          <span aria-hidden="true" className="text-muted-foreground">
                            →
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            {String(event.afterValue ?? "—")}
                          </span>
                        </p>
                      ) : null}

                      {Array.isArray(event.addedItems) && event.addedItems.length > 0 ? (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {(event.addedItems as string[]).slice(0, 6).map((item) => (
                            <li
                              key={item}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-mono text-muted-foreground"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <Link
                        href={`/app/websites/${event.website.id}/scans/${event.currentScanId}`}
                        className="mt-2 inline-block text-caption text-primary underline-offset-2 hover:underline"
                      >
                        {t("drift.viewScan")} →
                      </Link>
                    </Card>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
