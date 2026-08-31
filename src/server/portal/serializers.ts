import "server-only";
import { unsafeGlobalClient } from "@pdm/database";
import {
  DRIFT_CHANGE_LABEL,
  PORTAL_SEVERITY_LABEL,
  PORTAL_STATUS_LABEL,
} from "@pdm/shared/copy/labels";
import { t } from "@pdm/shared/copy";
import type { PortalSessionContext } from "./session";

/**
 * CLIENT-SAFE SERIALIZERS — PLAN.md Part VI §6.10, Part III §3.13.
 *
 * ⚠️ THE FORBIDDEN FIELDS ARE **STRUCTURALLY ABSENT** FROM THESE TYPES, not
 * hidden in a template (§6.10, and a Phase 4 acceptance criterion asserted on
 * the JSON rather than on the render). Never exposed, per §3.13:
 *
 *   internal notes · agency-internal assignments · rule IDs · raw network
 *   requests · cookie values · evidence exports · other clients' anything ·
 *   agency billing · AI cost data · scanner version details · developer fix
 *   guidance
 *
 * ⚠️ A SEPARATE SERIALIZER, NOT THE APP'S WITH A `hideInternal` FLAG. Feature
 * doc 15 names the trap: "a flag defaults wrong exactly once and leaks internal
 * notes to a client." There is no flag here, so there is nothing to default.
 *
 * ⚠️ EVERY QUERY FILTERS ON **BOTH** `agencyId` AND `clientId` (§6.10). The
 * tenant predicate alone is not enough — an agency has many clients, and a
 * portal session belongs to exactly one of them.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): a portal request has no agency context
  // until the session resolves it. Every query below applies BOTH ids from the
  // session explicitly, which is a stricter scope than `forAgency` provides.
  "portal reads are scoped by agencyId AND clientId from the session",
);

/** The scope predicate. Used by every query in this file, without exception. */
function scope(session: PortalSessionContext) {
  return { agencyId: session.agencyId, clientId: session.clientId };
}

// ── DTOs. What is NOT here is the point. ─────────────────────────────────────

export interface PortalOverview {
  clientName: string;
  /** Null when no complete scan has run. Never a number from a PARTIAL scan. */
  score: number | null;
  scoreWord: string;
  scoreInterpretation: string;
  monitoringLabel: string;
  lastCheckedIso: string | null;
  itemCounts: { needsAttention: number; worthReviewing: number; informational: number };
  items: PortalIssue[];
  changes: PortalChange[];
  latestReport: PortalReport | null;
}

export interface PortalIssue {
  id: string;
  title: string;
  /** The static, rule-authored client-facing sentence. Never fix guidance. */
  explanation: string;
  severityWord: string;
  statusWord: string;
  detectedIso: string;
  websiteLabel: string;
}

export interface PortalChange {
  id: string;
  sentence: string;
  detectedIso: string;
}

export interface PortalReport {
  id: string;
  name: string;
  periodLabel: string | null;
  generatedIso: string | null;
  sizeBytes: number | null;
}

export interface PortalScan {
  id: string;
  checkedIso: string;
  outcomeWord: string;
  score: number | null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * ⚠️ IGNORED AND UNVERIFIED ISSUES ARE EXCLUDED. An ignored finding is an
 * agency decision with a written reason attached; surfacing it to their client
 * re-opens a conversation the agency deliberately closed. An UNVERIFIED one is
 * below the confidence threshold and is not shown as a finding even internally
 * (§4.14).
 */
const CLIENT_VISIBLE_STATUSES = [
  "NEW",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "REOPENED",
  "RESOLVED",
  "VERIFIED",
] as const;

export async function getPortalIssues(
  session: PortalSessionContext,
  limit = 50,
): Promise<PortalIssue[]> {
  const rows = await db.issue.findMany({
    where: {
      agencyId: session.agencyId,
      website: { clientId: session.clientId, archivedAt: null },
      status: { in: [...CLIENT_VISIBLE_STATUSES] },
    },
    select: {
      id: true,
      title: true,
      // `message` is the client-facing sentence. `technicalReason` and
      // `recommendedAction` are developer-facing and are NOT selected — the
      // forbidden fields never enter the process, let alone the response.
      message: true,
      severity: true,
      status: true,
      firstDetectedAt: true,
      website: { select: { url: true, label: true } },
    },
    orderBy: [{ severity: "asc" }, { firstDetectedAt: "desc" }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    explanation: row.message,
    severityWord: PORTAL_SEVERITY_LABEL[row.severity],
    statusWord: PORTAL_STATUS_LABEL[row.status],
    detectedIso: row.firstDetectedAt.toISOString(),
    websiteLabel: row.website.label ?? row.website.url,
  }));
}

export async function getPortalChanges(
  session: PortalSessionContext,
  limit = 6,
): Promise<PortalChange[]> {
  const rows = await db.privacyDriftEvent.findMany({
    where: {
      agencyId: session.agencyId,
      website: { clientId: session.clientId, archivedAt: null },
    },
    // `addedItems`, `removedItems`, `beforeValue` and `afterValue` are raw
    // technical detail and are deliberately not selected (§3.13).
    select: { id: true, changeType: true, detectedAt: true, website: { select: { url: true, label: true } } },
    orderBy: { detectedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    // Plain language, built from the change TYPE and the site — never the
    // engine's own summary, which names vendors and domains (§3.13).
    sentence: `${DRIFT_CHANGE_LABEL[row.changeType]} — ${row.website.label ?? row.website.url}`,
    detectedIso: row.detectedAt.toISOString(),
  }));
}

export async function getPortalReports(
  session: PortalSessionContext,
  limit = 24,
): Promise<PortalReport[]> {
  const rows = await db.report.findMany({
    where: { ...scope(session), status: "READY", deletedAt: null },
    // `s3Key` and `brandingSnapshot` are not selected: the key is an internal
    // storage path and the download goes through a route that re-checks the
    // session.
    select: {
      id: true,
      name: true,
      periodStart: true,
      periodEnd: true,
      generatedAt: true,
      sizeBytes: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    periodLabel:
      row.periodStart && row.periodEnd
        ? `${formatDay(row.periodStart)} – ${formatDay(row.periodEnd)}`
        : null,
    generatedIso: row.generatedAt?.toISOString() ?? null,
    sizeBytes: row.sizeBytes,
  }));
}

export async function getPortalScans(
  session: PortalSessionContext,
  limit = 30,
): Promise<PortalScan[]> {
  const rows = await db.scan.findMany({
    where: {
      agencyId: session.agencyId,
      website: { clientId: session.clientId, archivedAt: null },
      status: { in: ["COMPLETED", "PARTIAL", "FAILED"] },
    },
    // No `scannerVersion`, no `workerId`, no `errorCode` — scanner internals
    // are on the forbidden list (§3.13).
    select: { id: true, status: true, finishedAt: true, createdAt: true, healthScore: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    checkedIso: (row.finishedAt ?? row.createdAt).toISOString(),
    outcomeWord:
      row.status === "COMPLETED"
        ? t("portal.scanCheckedOk")
        : row.status === "PARTIAL"
          ? t("portal.scanCheckedPartial")
          : t("portal.scanCheckFailed"),
    // ⚠️ P5 — a PARTIAL or FAILED check shows no score. A client seeing 84
    // beside "partially checked" would read it as a clean result.
    score: row.status === "COMPLETED" ? row.healthScore : null,
  }));
}

export async function getPortalOverview(
  session: PortalSessionContext,
): Promise<PortalOverview> {
  const [client, websites, issues, changes, reports] = await Promise.all([
    db.client.findFirst({
      where: { id: session.clientId, agencyId: session.agencyId },
      select: { name: true },
    }),
    db.website.findMany({
      where: { agencyId: session.agencyId, clientId: session.clientId, archivedAt: null },
      select: {
        healthScore: true,
        scoreConfidence: true,
        scanFrequency: true,
        lastSuccessfulScanAt: true,
      },
    }),
    getPortalIssues(session, 8),
    getPortalChanges(session, 4),
    getPortalReports(session, 1),
  ]);

  /*
   * ⚠️ PARTIAL-CONFIDENCE SITES ARE EXCLUDED FROM THE AVERAGE, not counted as
   * zero (P5). Averaging an unknown as zero would show a client a collapse
   * their site never had.
   */
  const scored = websites.filter(
    (site) => site.healthScore !== null && site.scoreConfidence !== "PARTIAL",
  );
  const score =
    scored.length === 0
      ? null
      : Math.round(
          scored.reduce((total, site) => total + (site.healthScore ?? 0), 0) / scored.length,
        );

  const lastChecked = websites
    .map((site) => site.lastSuccessfulScanAt)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const counts = { needsAttention: 0, worthReviewing: 0, informational: 0 };
  for (const issue of issues) {
    if (issue.severityWord === t("portal.severityNeedsAttention")) counts.needsAttention += 1;
    else if (issue.severityWord === t("portal.severityWorthReviewing")) counts.worthReviewing += 1;
    else counts.informational += 1;
  }

  return {
    clientName: client?.name ?? "",
    score,
    scoreWord: scoreWord(score),
    scoreInterpretation: scoreInterpretation(score),
    monitoringLabel: monitoringLabel(websites[0]?.scanFrequency ?? "WEEKLY"),
    lastCheckedIso: lastChecked?.toISOString() ?? null,
    itemCounts: counts,
    items: issues,
    changes,
    latestReport: reports[0] ?? null,
  };
}

/** The report a portal user may download — re-checked against BOTH ids. */
export async function getPortalReportForDownload(
  session: PortalSessionContext,
  reportId: string,
): Promise<{ id: string; s3Key: string; name: string } | null> {
  const report = await db.report.findFirst({
    where: { id: reportId, ...scope(session), status: "READY", deletedAt: null },
    select: { id: true, s3Key: true, name: true },
  });
  return report?.s3Key ? { id: report.id, s3Key: report.s3Key, name: report.name } : null;
}

// ── Plain-language mapping (§3.13) ───────────────────────────────────────────

/**
 * ⚠️ NO CROSS-CLIENT COMPARISON, EVER (§12.3 acceptance criterion). The words
 * describe this client's own site and never rank it against anyone else's —
 * a portal that said "below average for your industry" would be inventing a
 * benchmark we do not have.
 */
function scoreWord(score: number | null): string {
  if (score === null) return t("outcome.undetermined");
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Needs work";
  return "Needs attention";
}

function scoreInterpretation(score: number | null): string {
  if (score === null) return t("portal.scoreUnavailable");
  if (score >= 90) return t("portal.scoreExcellent");
  if (score >= 75) return t("portal.scoreGood");
  if (score >= 50) return t("portal.scoreFair");
  if (score >= 25) return t("portal.scorePoor");
  return t("portal.scoreVeryLow");
}

function monitoringLabel(frequency: string): string {
  switch (frequency) {
    case "DAILY":
      return t("portal.monitoredDaily");
    case "MONTHLY":
      return t("portal.monitoredMonthly");
    default:
      return t("portal.monitoredWeekly");
  }
}

function formatDay(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(
    value,
  );
}
