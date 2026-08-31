import { repositoriesFor } from "@pdm/database/repositories";
// One import statement, not two: esbuild's ESM interop resolved the second
// `from "@pdm/notifications"` against a partially-initialised barrel and the
// worker died at boot on a missing export that is demonstrably there.
import {
  ROLLUP_THRESHOLD,
  dedupeKey,
  renderCopy,
  shouldAlertUnreachable,
} from "@pdm/notifications";
import {
  enqueueNotification,
  type NotificationJobData,
} from "@pdm/scanner/queue/queues";
import { childLogger } from "@pdm/shared/logger";
import type { Queue } from "bullmq";

/**
 * SCAN → ALERT BRIDGE — PLAN.md Part VI §6.6, Phase 4 task 4.2.
 *
 * ⚠️ SEPARATE FROM `analysis.ts` ON PURPOSE. P6: nothing downstream of the
 * evidence collector may add facts, and the analysis job's contract is
 * "interpret stored evidence". Alerting is a DELIVERY concern reading what
 * analysis wrote — keeping it here is what lets analysis be re-run over history
 * (§4.14) without emailing an agency about findings from six months ago.
 *
 * ⚠️ IT ENQUEUES, IT DOES NOT SEND. Quiet hours, digests, preferences and the
 * duplicate window are all decided by the dispatcher (`notification.job.ts`).
 * Anything that decided delivery here would be a second, divergent copy of
 * §6.6.
 */

export async function emitScanAlerts(
  agencyId: string,
  scanId: string,
  queue: Queue<NotificationJobData>,
): Promise<number> {
  const log = childLogger({ agencyId, scanId, component: "alerts" });
  const repos = repositoriesFor(agencyId);

  const scan = await repos.db.scan.findUnique({
    where: { id: scanId },
    select: {
      id: true,
      status: true,
      finishedAt: true,
      errorCode: true,
      websiteId: true,
      website: {
        select: {
          id: true,
          url: true,
          label: true,
          clientId: true,
          groupId: true,
          consecutiveFailures: true,
          alertProfile: true,
        },
      },
    },
  });
  if (!scan) return 0;

  const site = scan.website;
  const websiteLabel = site.label ?? site.url;

  /*
   * ⚠️ THE PER-WEBSITE ALERT PROFILE IS HONOURED BEFORE ANY RULE (§3.5).
   * SILENT means the agency has said "monitor this, but never tell me" —
   * usually a staging site. Findings and drift are still recorded and still
   * visible in the app; only the push stops.
   */
  if (site.alertProfile === "SILENT") {
    log.info({ websiteId: site.id }, "alerts suppressed by website profile");
    return 0;
  }
  const criticalOnly = site.alertProfile === "CRITICAL_ONLY";

  const base = {
    agencyId,
    websiteId: site.id,
    websiteGroupId: site.groupId,
    clientId: site.clientId,
    websiteLabel,
  };

  const events: NotificationJobData[] = [];

  const push = (
    type: NotificationJobData["type"],
    severity: string,
    entity: { entityType: string | null; entityId: string | null; linkUrl: string | null },
    overrides: { title?: string; body?: string } = {},
  ) => {
    if (criticalOnly && severity !== "CRITICAL") return;
    const copy = renderCopy(type as never, websiteLabel);
    events.push({
      ...base,
      type,
      severity,
      title: overrides.title ?? copy.title,
      body: overrides.body ?? copy.body,
      linkUrl: entity.linkUrl,
      entityType: entity.entityType,
      entityId: entity.entityId,
      dedupeKey: dedupeKey({ agencyId, type, entityId: entity.entityId }),
    });
  };

  // ── Scan outcome ────────────────────────────────────────────────────────
  if (scan.status === "FAILED") {
    /*
     * ⚠️ A SINGLE FAILURE IS NOT AN ALERT. §6.6: a website in a failing state
     * alerts on the THIRD consecutive failure, then at most daily. A site
     * behind an intermittent WAF would otherwise page an agency nightly.
     */
    if (
      shouldAlertUnreachable({
        consecutiveFailures: site.consecutiveFailures,
        // Suppression across days is the dispatcher's 4-hour window plus the
        // dedupe key, which is stable per (agency, type, website).
        lastAlertedAt: null,
        now: scan.finishedAt ?? new Date(),
      })
    ) {
      push("WEBSITE_UNREACHABLE", "HIGH", {
        entityType: "website",
        entityId: site.id,
        linkUrl: `/app/websites/${site.id}`,
      }, { body: scan.errorCode ?? "The site did not respond." });
    } else {
      push("SCAN_FAILED", "HIGH", {
        entityType: "scan",
        entityId: scan.id,
        linkUrl: `/app/websites/${site.id}/scans/${scan.id}`,
      });
    }
  } else if (scan.status === "PARTIAL") {
    // P5 — the agency is told the scan was incomplete rather than being left to
    // read a clean-looking dashboard.
    push("SCAN_PARTIAL", "MEDIUM", {
      entityType: "scan",
      entityId: scan.id,
      linkUrl: `/app/websites/${site.id}/scans/${scan.id}`,
    });
  }

  // ── Findings raised by THIS scan ────────────────────────────────────────
  const newIssues = await repos.db.issue.findMany({
    where: { websiteId: site.id, lastScanId: scanId, status: { in: ["NEW", "REOPENED"] } },
    select: { id: true, title: true, severity: true, category: true },
    orderBy: { severity: "asc" },
    take: ROLLUP_THRESHOLD + 1,
  });

  /*
   * ⚠️ FLOOD CONTROL (§6.6): more than ten alertable findings from one scan
   * collapse into a single "N findings on example.com" alert linking to the
   * filtered queue. Twelve emails about one site is how an agency learns to
   * mute us.
   */
  if (newIssues.length > ROLLUP_THRESHOLD) {
    push(
      "CRITICAL_ISSUE",
      "HIGH",
      {
        entityType: "website",
        entityId: site.id,
        linkUrl: `/app/issues?website=${site.id}&status=NEW`,
      },
      {
        title: `${newIssues.length} potential issues detected on ${websiteLabel}`,
        body: "The latest scan produced several findings. Open the queue to triage them.",
      },
    );
  } else {
    for (const issue of newIssues) {
      if (issue.severity === "CRITICAL") {
        push(
          "CRITICAL_ISSUE",
          "CRITICAL",
          { entityType: "issue", entityId: issue.id, linkUrl: `/app/issues/${issue.id}` },
          { title: issue.title },
        );
      } else if (issue.category === "NEW_TRACKER") {
        push(
          "NEW_TRACKER",
          issue.severity,
          { entityType: "issue", entityId: issue.id, linkUrl: `/app/issues/${issue.id}` },
          { title: issue.title },
        );
      }
    }
  }

  // ── Drift recorded by THIS scan ─────────────────────────────────────────
  const drift = await repos.db.privacyDriftEvent.findMany({
    where: { currentScanId: scanId },
    select: { id: true, changeType: true, severity: true, summary: true },
    orderBy: { severity: "asc" },
    take: 20,
  });

  // A consent regression is the highest-priority alert we send (§9.5): the site
  // stopped respecting a rejection it previously respected.
  const regression = drift.find((event) => event.changeType === "CONSENT_REGRESSION");
  if (regression) {
    push(
      "CONSENT_REGRESSION",
      "CRITICAL",
      {
        entityType: "drift",
        entityId: regression.id,
        linkUrl: `/app/websites/${site.id}/changes`,
      },
      { body: regression.summary },
    );
  }

  const otherDrift = drift.filter((event) => event.changeType !== "CONSENT_REGRESSION");
  if (otherDrift.length > 0) {
    const worst = otherDrift[0];
    push(
      "PRIVACY_DRIFT",
      worst?.severity ?? "MEDIUM",
      {
        entityType: "scan",
        entityId: scan.id,
        linkUrl: `/app/websites/${site.id}/changes`,
      },
      {
        body:
          otherDrift.length === 1
            ? (worst?.summary ?? "The latest scan differs from the baseline.")
            : `${otherDrift.length} changes were detected since the last scan.`,
      },
    );
  }

  for (const event of events) {
    await enqueueNotification(queue, event);
  }

  if (events.length > 0) {
    log.info({ count: events.length }, "scan alerts enqueued");
  }
  return events.length;
}
