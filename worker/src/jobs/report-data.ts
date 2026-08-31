import { repositoriesFor } from "@pdm/database/repositories";
import type { Branding } from "@pdm/shared/branding";
import {
  CONSENT_PHASE_LABEL,
  DRIFT_CHANGE_LABEL,
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
  RISK_LABEL,
  SCAN_STATUS_LABEL,
  SEVERITY_LABEL,
  TRACKER_CATEGORY_LABEL,
} from "@pdm/shared/copy/labels";
import { reportCopy } from "@pdm/reports/copy";
import type {
  ConsentMatrixRow,
  CookieLine,
  DriftLine,
  EvidenceLine,
  IssueLine,
  ReportDocument,
  ReportMeta,
  ReportOptions,
  ReportPayload,
  ScoreBreakdownLine,
  TrackerLine,
} from "@pdm/reports/types";
import { objectStore } from "@pdm/storage";
import { childLogger } from "@pdm/shared/logger";

/**
 * REPORT DATA COLLECTION — PLAN.md Part VI §6.8.
 *
 * ⚠️ EVERY READ IS TENANT-SCOPED VIA `repositoriesFor(agencyId)`. A report is
 * the artefact most likely to be forwarded outside the agency, so a
 * cross-tenant row that reached one would be visible to a third party who has
 * no relationship with us at all.
 *
 * ⚠️ COLLECTION HAPPENS HERE, RENDERING HAPPENS IN `@pdm/reports`. §6.9: the
 * templates must stay pure, because a template that queried would read whatever
 * client the ambient scope happened to be — a coin flip in a worker rendering
 * two agencies concurrently.
 *
 * ⚠️ CAPS ARE DELIBERATE. Feature doc 14 names "renderer timeout on a huge
 * evidence appendix" as a failure mode with the handling "cap appendix size;
 * degrade to summary + note". The caps below are that handling.
 */

const MAX_ISSUES = 150;
const MAX_EVIDENCE_PER_ISSUE = 10;
const MAX_DRIFT_EVENTS = 200;
const MAX_TRACKERS = 200;
const MAX_COOKIES = 200;
const MAX_SCREENSHOTS = 8;
/** A data-URI screenshot inflates ~33%; eight of these is already a heavy PDF. */
const MAX_SCREENSHOT_BYTES = 1_500_000;

const log = childLogger({ component: "reports" });

type Repos = ReturnType<typeof repositoriesFor>;

export interface CollectInput {
  agencyId: string;
  reportId: string;
  type: ReportDocument["meta"]["type"];
  name: string;
  clientId: string | null;
  websiteId: string | null;
  scanId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  options: ReportOptions;
  branding: Branding;
  timeZone: string;
  agencyName: string;
  generatedAt: Date;
}

export async function collectReportDocument(
  input: CollectInput,
): Promise<ReportDocument> {
  const repos = repositoriesFor(input.agencyId);

  const [client, website] = await Promise.all([
    input.clientId
      ? repos.db.client.findUnique({
          where: { id: input.clientId },
          select: { name: true },
        })
      : Promise.resolve(null),
    input.websiteId
      ? repos.db.website.findUnique({
          where: { id: input.websiteId },
          select: { url: true, label: true },
        })
      : Promise.resolve(null),
  ]);

  const meta: ReportMeta = {
    reportId: input.reportId,
    type: input.type,
    name: input.name,
    generatedAt: input.generatedAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    timeZone: input.timeZone,
    agencyName: input.agencyName,
    clientName: client?.name ?? null,
    websiteLabel: website?.label ?? website?.url ?? null,
  };

  const payload = await collectPayload(repos, input);

  return { meta, options: input.options, branding: input.branding, payload };
}

async function collectPayload(
  repos: Repos,
  input: CollectInput,
): Promise<ReportPayload> {
  switch (input.type) {
    case "SCAN":
      return collectScan(repos, input);
    case "ISSUE":
      return { type: "ISSUE", issues: await collectIssues(repos, input) };
    case "MONTHLY_MONITORING":
      return collectMonthly(repos, input);
    case "WEBSITE_HEALTH":
      return collectHealth(repos, input);
    case "PRIVACY_DRIFT":
      return collectDrift(repos, input);
    default: {
      const unreachable: never = input.type;
      throw new Error(`Unknown report type: ${String(unreachable)}`);
    }
  }
}

// ── SCAN ─────────────────────────────────────────────────────────────────────

async function collectScan(repos: Repos, input: CollectInput) {
  if (!input.scanId) throw new Error("SCAN report requires a scanId");

  const scan = await repos.db.scan.findUnique({
    where: { id: input.scanId },
    include: {
      phases: true,
      website: { select: { url: true, label: true } },
      detections: { include: { vendor: true }, take: MAX_TRACKERS },
      cookies: { take: MAX_COOKIES, orderBy: { name: "asc" } },
      screenshots: { take: MAX_SCREENSHOTS },
    },
  });
  if (!scan) throw new Error(`Scan ${input.scanId} not found for this agency`);

  const websiteLabel = scan.website.label ?? scan.website.url;

  /*
   * ⚠️ P5 — A PARTIAL SCAN HAS NO SCORE IN A REPORT. The column may hold a
   * number, but a document that prints it alongside "some journeys were not
   * completed" reads as a clean verdict, which is exactly what §0.2 P5 forbids.
   */
  const incompletePhases = scan.phases
    .filter((phase) => phase.status !== "EXECUTED")
    .map((phase) => CONSENT_PHASE_LABEL[phase.phase]);

  const score =
    scan.status === "COMPLETED" && incompletePhases.length === 0 ? scan.healthScore : null;

  const consentMatrix: ConsentMatrixRow[] = scan.phases.map((phase) => {
    const executed = phase.status === "EXECUTED";
    const trackers = scan.detections.filter((d) => d.consentPhase === phase.phase).length;
    const cookies = scan.cookies.filter((c) => c.consentPhase === phase.phase).length;
    return {
      phaseLabel: CONSENT_PHASE_LABEL[phase.phase],
      // Never pass/fail — the three approved outcome words only (§1.12).
      outcome: !executed
        ? reportCopy.outcomes.unknown
        : trackers > 0
          ? reportCopy.outcomes.detected
          : reportCopy.outcomes.notDetected,
      trackerCount: executed ? trackers : null,
      cookieCount: executed ? cookies : null,
      note: executed ? null : (phase.errorCode ?? reportCopy.outcomes.unknown),
    };
  });

  const trackers = toTrackerLines(scan.detections);
  const cookies = toCookieLines(scan.cookies);
  const issues = await collectIssues(repos, input, { websiteId: scan.websiteId });

  const [total, thirdParty, beforeConsent] = await Promise.all([
    repos.db.networkRequest.count({ where: { scanId: scan.id } }),
    repos.db.networkRequest.count({ where: { scanId: scan.id, isThirdParty: true } }),
    repos.db.networkRequest.count({
      where: { scanId: scan.id, isThirdParty: true, consentPhase: "NO_CONSENT" },
    }),
  ]);

  const screenshots = input.options.includeScreenshots
    ? await loadScreenshots(scan.screenshots)
    : [];

  return {
    type: "SCAN" as const,
    scan: {
      scanId: scan.id,
      startedAt: scan.startedAt ?? scan.queuedAt,
      statusLabel: SCAN_STATUS_LABEL[scan.status],
      score,
      issueCount: issues.length,
      trackerCount: trackers.length,
      incompletePhases,
    },
    consentMatrix,
    trackers,
    cookies,
    issues: issues.map((issue) => ({ ...issue, websiteLabel })),
    requestSummary: { total, thirdParty, beforeConsent },
    screenshots,
  };
}

// ── ISSUES ───────────────────────────────────────────────────────────────────

async function collectIssues(
  repos: Repos,
  input: CollectInput,
  scope: { websiteId?: string } = {},
): Promise<IssueLine[]> {
  const websiteId = scope.websiteId ?? input.websiteId ?? undefined;

  /*
   * ⚠️ IGNORED IS ALWAYS EXCLUDED. An agency suppressed it deliberately and
   * with a written reason; printing it into a client's report would re-raise a
   * decision they already made and documented.
   */
  const statuses = input.options.includeResolvedIssues
    ? (["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED", "RESOLVED", "VERIFIED"] as const)
    : (["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED"] as const);

  const rows = await repos.db.issue.findMany({
    where: {
      ...(websiteId ? { websiteId } : {}),
      ...(input.clientId && !websiteId ? { website: { clientId: input.clientId } } : {}),
      status: { in: [...statuses] },
      ...(input.periodStart && input.periodEnd
        ? { lastSeenAt: { gte: input.periodStart, lte: input.periodEnd } }
        : {}),
    },
    include: {
      website: { select: { url: true, label: true } },
      evidence: input.options.includeEvidenceAppendix
        ? { take: MAX_EVIDENCE_PER_ISSUE, orderBy: { createdAt: "asc" } }
        : false,
    },
    orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }],
    take: MAX_ISSUES,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    severityLabel: SEVERITY_LABEL[row.severity],
    categoryLabel: ISSUE_CATEGORY_LABEL[row.category],
    statusLabel: ISSUE_STATUS_LABEL[row.status],
    message: row.message,
    technicalReason: row.technicalReason,
    recommendedAction: row.recommendedAction,
    firstDetectedAt: row.firstDetectedAt,
    lastSeenAt: row.lastSeenAt,
    websiteLabel: row.website.label ?? row.website.url,
    // ⚠️ Never populated from a model here. AI explanation is Phase 5 and
    // arrives already validated against `evidence_refs` (P2); until then the
    // report renders the rule-authored text, which is the point of P3.
    aiSummary: null,
    evidence:
      "evidence" in row && Array.isArray(row.evidence)
        ? row.evidence.map(toEvidenceLine)
        : [],
  }));
}

function toEvidenceLine(row: {
  id: string;
  kind: string;
  consentPhase: keyof typeof CONSENT_PHASE_LABEL;
  pageUrl: string;
  payload: unknown;
  createdAt: Date;
}): EvidenceLine {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  // ⚠️ The payload was sanitised before storage (§10.6). Nothing here
  // re-derives a raw URL or a cookie value — it prints what was recorded.
  const summary =
    typeof payload.url === "string"
      ? payload.url
      : typeof payload.name === "string"
        ? payload.name
        : row.pageUrl;

  return {
    id: row.id,
    kindLabel: row.kind.replace(/_/g, " ").toLowerCase(),
    consentPhaseLabel: CONSENT_PHASE_LABEL[row.consentPhase],
    summary: summary.slice(0, 300),
    detail: typeof payload.method === "string" ? String(payload.method) : null,
    recordedAt: row.createdAt,
  };
}

// ── MONTHLY MONITORING ───────────────────────────────────────────────────────

async function collectMonthly(repos: Repos, input: CollectInput) {
  const from = input.periodStart ?? new Date(0);
  const to = input.periodEnd ?? input.generatedAt;
  const websiteWhere = input.clientId ? { clientId: input.clientId } : {};

  const websites = await repos.db.website.findMany({
    where: { ...websiteWhere, archivedAt: null },
    select: {
      id: true,
      url: true,
      label: true,
      healthScore: true,
      openIssueCount: true,
      lastScanAt: true,
      monitoringStatus: true,
      scoreConfidence: true,
    },
  });
  const websiteIds = websites.map((w) => w.id);

  const scans = await repos.db.scan.findMany({
    where: { websiteId: { in: websiteIds }, createdAt: { gte: from, lte: to } },
    select: { status: true, healthScore: true, finishedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const [issuesOpened, issuesResolved, openIssues, drift, issues] = await Promise.all([
    repos.db.issue.count({
      where: { websiteId: { in: websiteIds }, firstDetectedAt: { gte: from, lte: to } },
    }),
    repos.db.issue.count({
      where: { websiteId: { in: websiteIds }, resolvedAt: { gte: from, lte: to } },
    }),
    repos.db.issue.groupBy({
      by: ["severity"],
      where: {
        websiteId: { in: websiteIds },
        status: { in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED"] },
      },
      _count: { _all: true },
    }),
    repos.db.privacyDriftEvent.findMany({
      where: { websiteId: { in: websiteIds }, detectedAt: { gte: from, lte: to } },
      include: { website: { select: { url: true, label: true } } },
      orderBy: { detectedAt: "desc" },
      take: MAX_DRIFT_EVENTS,
    }),
    collectIssues(repos, input),
  ]);

  const openBySeverity = emptySeverityCounts();
  for (const row of openIssues) openBySeverity[row.severity] = row._count._all;

  return {
    type: "MONTHLY_MONITORING" as const,
    scansPerformed: scans.length,
    scansSucceeded: scans.filter((s) => s.status === "COMPLETED").length,
    scansPartial: scans.filter((s) => s.status === "PARTIAL").length,
    scansFailed: scans.filter((s) => s.status === "FAILED").length,
    websitesMonitored: websites.length,
    // ⚠️ A PARTIAL scan contributes a NULL point, which the chart draws as a
    // gap. Plotting it as zero would show a cliff the site never had.
    scoreTrend: scans.map((scan) => ({
      at: scan.finishedAt ?? scan.createdAt,
      score: scan.status === "COMPLETED" ? scan.healthScore : null,
    })),
    issuesOpened,
    issuesResolved,
    openBySeverity,
    drift: drift.map(toDriftLine),
    issues,
    perWebsite: websites.map((website) => ({
      websiteLabel: website.label ?? website.url,
      score: website.scoreConfidence === "PARTIAL" ? null : website.healthScore,
      openIssues: website.openIssueCount,
      lastScannedAt: website.lastScanAt,
      statusLabel: website.monitoringStatus,
    })),
  };
}

// ── WEBSITE HEALTH ───────────────────────────────────────────────────────────

async function collectHealth(repos: Repos, input: CollectInput) {
  if (!input.websiteId) throw new Error("WEBSITE_HEALTH report requires a websiteId");

  const website = await repos.db.website.findUnique({
    where: { id: input.websiteId },
    select: {
      id: true,
      url: true,
      label: true,
      healthScore: true,
      scoreConfidence: true,
      lastScanId: true,
      lastSuccessfulScanAt: true,
    },
  });
  if (!website) throw new Error(`Website ${input.websiteId} not found for this agency`);

  const scan = website.lastScanId
    ? await repos.db.scan.findUnique({
        where: { id: website.lastScanId },
        include: {
          phases: true,
          detections: { include: { vendor: true }, take: MAX_TRACKERS },
        },
      })
    : null;

  const partial = website.scoreConfidence === "PARTIAL";
  const breakdown = toScoreBreakdown(scan?.scoreBreakdown);

  const consentMatrix: ConsentMatrixRow[] = (scan?.phases ?? []).map((phase) => {
    const executed = phase.status === "EXECUTED";
    const trackers =
      scan?.detections.filter((d) => d.consentPhase === phase.phase).length ?? 0;
    return {
      phaseLabel: CONSENT_PHASE_LABEL[phase.phase],
      outcome: !executed
        ? reportCopy.outcomes.unknown
        : trackers > 0
          ? reportCopy.outcomes.detected
          : reportCopy.outcomes.notDetected,
      trackerCount: executed ? trackers : null,
      cookieCount: null,
      note: executed ? null : (phase.errorCode ?? reportCopy.outcomes.unknown),
    };
  });

  return {
    type: "WEBSITE_HEALTH" as const,
    // P5 again: a PARTIAL confidence prints "could not be determined".
    score: partial ? null : website.healthScore,
    scoreConfidenceLabel: partial
      ? reportCopy.partial.heading
      : reportCopy.outcomes.detected,
    breakdown,
    consentMatrix,
    trackers: toTrackerLines(scan?.detections ?? []),
    issues: await collectIssues(repos, input, { websiteId: website.id }),
    lastScannedAt: website.lastSuccessfulScanAt,
  };
}

// ── PRIVACY DRIFT ────────────────────────────────────────────────────────────

async function collectDrift(repos: Repos, input: CollectInput) {
  const events = await repos.db.privacyDriftEvent.findMany({
    where: {
      ...(input.websiteId ? { websiteId: input.websiteId } : {}),
      ...(input.clientId && !input.websiteId
        ? { website: { clientId: input.clientId } }
        : {}),
      ...(input.periodStart && input.periodEnd
        ? { detectedAt: { gte: input.periodStart, lte: input.periodEnd } }
        : {}),
    },
    include: { website: { select: { url: true, label: true } } },
    orderBy: { detectedAt: "desc" },
    take: MAX_DRIFT_EVENTS,
  });

  const bySeverity = emptySeverityCounts();
  for (const event of events) bySeverity[event.severity] += 1;

  return { type: "PRIVACY_DRIFT" as const, events: events.map(toDriftLine), bySeverity };
}

// ── shared mappers ───────────────────────────────────────────────────────────

function emptySeverityCounts() {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
}

function toDriftLine(event: {
  detectedAt: Date;
  changeType: keyof typeof DRIFT_CHANGE_LABEL;
  severity: keyof typeof SEVERITY_LABEL;
  summary: string;
  beforeValue: unknown;
  afterValue: unknown;
  website: { url: string; label: string | null };
}): DriftLine {
  return {
    detectedAt: event.detectedAt,
    websiteLabel: event.website.label ?? event.website.url,
    changeTypeLabel: DRIFT_CHANGE_LABEL[event.changeType],
    severity: event.severity,
    severityLabel: SEVERITY_LABEL[event.severity],
    summary: event.summary,
    before: describeValue(event.beforeValue),
    after: describeValue(event.afterValue),
  };
}

/** Renders a drift JSON value as a short readable string, never raw JSON. */
function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.slice(0, 6).map(String).join(", ");
  const record = value as Record<string, unknown>;
  return Object.entries(record)
    .slice(0, 4)
    .map(([key, entry]) => `${key}: ${String(entry)}`)
    .join(" · ");
}

function toTrackerLines(
  detections: readonly {
    consentPhase: string;
    firstSeenAt?: Date | null;
    createdAt?: Date;
    unknownDomain: string | null;
    vendor: {
      name: string;
      category: keyof typeof TRACKER_CATEGORY_LABEL;
      riskLevel: keyof typeof RISK_LABEL;
      domainPatterns: string[];
    } | null;
  }[],
): TrackerLine[] {
  // Grouped by vendor: one vendor firing in three consent phases is one row
  // with "fired before consent", not three rows a reader has to reconcile.
  const byVendor = new Map<string, TrackerLine>();

  for (const detection of detections) {
    const name = detection.vendor?.name ?? detection.unknownDomain ?? "Unknown third party";
    const existing = byVendor.get(name);
    const firedBeforeConsent = detection.consentPhase === "NO_CONSENT";

    if (existing) {
      existing.firedBeforeConsent ||= firedBeforeConsent;
      continue;
    }

    byVendor.set(name, {
      vendorName: name,
      categoryLabel: detection.vendor
        ? TRACKER_CATEGORY_LABEL[detection.vendor.category]
        : TRACKER_CATEGORY_LABEL.UNKNOWN,
      riskLabel: detection.vendor ? RISK_LABEL[detection.vendor.riskLevel] : RISK_LABEL.MEDIUM,
      domains: detection.vendor?.domainPatterns.slice(0, 4) ??
        (detection.unknownDomain ? [detection.unknownDomain] : []),
      firstSeenAt: detection.firstSeenAt ?? detection.createdAt ?? null,
      firedBeforeConsent,
    });
  }

  return [...byVendor.values()];
}

function toCookieLines(
  cookies: readonly {
    name: string;
    domain: string;
    category: string;
    isSession: boolean;
    durationDays: number | null;
    consentPhase: string;
  }[],
): CookieLine[] {
  const seen = new Map<string, CookieLine>();
  for (const cookie of cookies) {
    const key = `${cookie.domain}|${cookie.name}`;
    const existing = seen.get(key);
    const setBeforeConsent = cookie.consentPhase === "NO_CONSENT";
    if (existing) {
      existing.setBeforeConsent ||= setBeforeConsent;
      continue;
    }
    seen.set(key, {
      name: cookie.name,
      domain: cookie.domain,
      categoryLabel:
        cookie.category in TRACKER_CATEGORY_LABEL
          ? TRACKER_CATEGORY_LABEL[cookie.category as keyof typeof TRACKER_CATEGORY_LABEL]
          : TRACKER_CATEGORY_LABEL.UNKNOWN,
      // ⚠️ Stored as a duration, not an expiry instant. An absolute expiry
      // would drift as the report is re-read months later; "365 days" is what
      // the browser was actually told.
      lifetimeDays: cookie.isSession ? null : cookie.durationDays,
      setBeforeConsent,
    });
  }
  return [...seen.values()];
}

function toScoreBreakdown(value: unknown): ScoreBreakdownLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    return [
      {
        label: String(row.component ?? "Deduction"),
        deduction: Number(row.penalty ?? 0),
        detail: String(row.reason ?? ""),
      },
    ];
  });
}

/**
 * Screenshots as data URIs.
 *
 * ⚠️ EMBEDDED, NOT LINKED (§6.8). The PDF must be self-contained: a signed URL
 * inside a document a client keeps for a year would 403 the moment it expired,
 * and the renderer aborts every network request anyway.
 *
 * ⚠️ A FAILED FETCH IS NOT A FAILED REPORT. A screenshot corroborates; it never
 * establishes a fact (P1). Losing one costs a picture.
 */
async function loadScreenshots(
  rows: readonly { s3Key: string; consentPhase: string; kind: string }[],
): Promise<{ label: string; dataUri: string }[]> {
  const store = objectStore();
  const shots: { label: string; dataUri: string }[] = [];

  for (const row of rows) {
    try {
      const bytes = await store.get(row.s3Key);
      if (!bytes || bytes.byteLength > MAX_SCREENSHOT_BYTES) continue;
      shots.push({
        label: `${CONSENT_PHASE_LABEL[row.consentPhase as keyof typeof CONSENT_PHASE_LABEL] ?? row.consentPhase} — ${row.kind.toLowerCase()}`,
        dataUri: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
      });
    } catch (error) {
      log.warn({ err: error, key: row.s3Key }, "screenshot unavailable; report continues");
    }
  }

  return shots;
}
