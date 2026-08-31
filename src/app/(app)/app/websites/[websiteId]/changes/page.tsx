import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { formatDate } from "@/lib/format";
import { DRIFT_CHANGE_LABEL } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getChangesTab } from "@/server/queries/website-tabs";
import { readStoredOutput } from "@/server/services/ai";
import { DriftSummarySection } from "@/components/ai/drift-summary";
import { can } from "@pdm/shared/permissions";

/**
 * CHANGES TAB — UI_DESIGN_PROMPTS §5.10, Phase 3 task 3.10.
 *
 * The per-website view of the same events the portfolio feed shows. Grouped by
 * day for the same reason: "when did this start" is a chronological question.
 *
 * ⚠️ An empty Changes tab is GOOD NEWS on a site with history, and MEANINGLESS
 * on one with a single scan — drift needs two completed scans to exist at all.
 * The two are given different copy rather than one ambiguous "no changes".
 *
 * ⚠️ THE PHASE 5 AI SUMMARY SITS ABOVE THE LIST AND NEVER REPLACES IT (§8.5:
 * the fallback for this feature is "the structured event list renders alone").
 * The list stays the authority; the summary is a reading aid over the top of
 * it. It is also skipped entirely on the empty branch below — there is nothing
 * to summarise, and the event list is what a reader came for.
 */
export default async function ChangesTabPage({
  params,
}: PageProps<"/app/websites/[websiteId]/changes">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);
  const [events, driftSummary] = await Promise.all([
    getChangesTab(ctx, websiteId),
    // Read, never generate, on render — §8.9's "on-demand by default".
    readStoredOutput(ctx, "SUMMARIZE_DRIFT", "website", websiteId),
  ]);

  if (events.length === 0) {
    return (
      <Card>
        <EmptyState title={t("websiteTabs.changes")} body={t("empty.noDriftYet")} />
      </Card>
    );
  }

  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const key = formatDate(event.detectedAt, ctx.timezone);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <div className="flex flex-col gap-6">
      {can(ctx.role, "ai:read") ? (
        <DriftSummarySection
          websiteId={websiteId}
          initial={driftSummary}
          canGenerate={can(ctx.role, "ai:generate")}
          hasEvents={events.length > 0}
        />
      ) : null}

      {[...byDay.entries()].map(([day, dayEvents]) => (
        <section key={day} className="flex flex-col gap-3">
          <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            {day}
          </h2>
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
                  </div>
                  <p className="mt-1.5 text-small font-medium">{event.summary}</p>

                  {/*
                    The added/removed mini-table §5.10 specifies. Added rows are
                    what a reader acts on, so they come first and carry the
                    warning tint; removals are usually the agency's own fix.
                  */}
                  {Array.isArray(event.addedItems) && event.addedItems.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {(event.addedItems as string[]).map((item) => (
                        <li
                          key={item}
                          className="rounded bg-warning-muted px-2 py-1 font-mono text-mono text-warning"
                        >
                          + {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {Array.isArray(event.removedItems) && event.removedItems.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {(event.removedItems as string[]).map((item) => (
                        <li
                          key={item}
                          className="rounded bg-muted px-2 py-1 font-mono text-mono text-muted-foreground"
                        >
                          − {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <Link
                    href={`/app/websites/${websiteId}/scans/${event.currentScanId}`}
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
  );
}
