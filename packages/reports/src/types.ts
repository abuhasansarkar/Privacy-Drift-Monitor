import type { Branding } from "@pdm/shared/branding";
import type { ReportType, Severity } from "@pdm/schemas";

/**
 * REPORT DATA CONTRACTS — PLAN.md Part VI §6.8.
 *
 * ⚠️ THE TEMPLATES RECEIVE FINISHED DATA AND COMPUTE NOTHING. Everything here
 * is collected by tenant-scoped repositories before rendering starts. A
 * template that ran a query would render whatever the ambient client was scoped
 * to, which in a worker rendering two agencies' reports concurrently is a
 * coin flip (§6.9).
 *
 * ⚠️ NOTHING HERE IS AI-GENERATED unless it is explicitly named `aiSummary`,
 * and that field is always optional — P3: findings render with or without AI.
 */

export interface ReportOptions {
  includeEvidenceAppendix: boolean;
  includeAiSummary: boolean;
  includeResolvedIssues: boolean;
  includeScreenshots: boolean;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  includeEvidenceAppendix: false,
  includeAiSummary: false,
  includeResolvedIssues: false,
  includeScreenshots: true,
};

export interface ReportMeta {
  reportId: string;
  type: ReportType;
  name: string;
  generatedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Display timezone — the agency's. Every date in the PDF uses it (§11.11). */
  timeZone: string;
  agencyName: string;
  clientName: string | null;
  websiteLabel: string | null;
}

export interface IssueLine {
  id: string;
  title: string;
  severity: Severity;
  severityLabel: string;
  categoryLabel: string;
  statusLabel: string;
  message: string;
  technicalReason: string;
  recommendedAction: string;
  firstDetectedAt: Date;
  lastSeenAt: Date;
  websiteLabel: string;
  /** Present only when the agency asked for AI and the output validated (P2). */
  aiSummary?: string | null;
  evidence: EvidenceLine[];
}

export interface EvidenceLine {
  id: string;
  kindLabel: string;
  consentPhaseLabel: string;
  /** Sanitised before storage (§10.6) — never a raw query string with a token. */
  summary: string;
  detail: string | null;
  recordedAt: Date;
}

export interface ConsentMatrixRow {
  phaseLabel: string;
  /** "Detected" · "Not detected" · "Could not be determined" — §1.12, never pass/fail. */
  outcome: string;
  trackerCount: number | null;
  cookieCount: number | null;
  note: string | null;
}

export interface TrackerLine {
  vendorName: string;
  categoryLabel: string;
  riskLabel: string;
  domains: string[];
  firstSeenAt: Date | null;
  firedBeforeConsent: boolean;
}

export interface CookieLine {
  name: string;
  domain: string;
  categoryLabel: string;
  /** Days, or null for a session cookie. */
  lifetimeDays: number | null;
  setBeforeConsent: boolean;
}

export interface ScoreBreakdownLine {
  label: string;
  deduction: number;
  detail: string;
}

export interface DriftLine {
  detectedAt: Date;
  websiteLabel: string;
  changeTypeLabel: string;
  severity: Severity;
  severityLabel: string;
  summary: string;
  before: string;
  after: string;
}

export interface ScanSummaryLine {
  scanId: string;
  startedAt: Date;
  statusLabel: string;
  /** Null on a PARTIAL or FAILED scan — P5, never a clean number. */
  score: number | null;
  issueCount: number;
  trackerCount: number;
  /** Named phases that did not complete. Rendered explicitly when non-empty. */
  incompletePhases: string[];
}

// ── The five report payloads (§6.8) ──────────────────────────────────────────

export interface ScanReportData {
  type: "SCAN";
  scan: ScanSummaryLine;
  consentMatrix: ConsentMatrixRow[];
  trackers: TrackerLine[];
  cookies: CookieLine[];
  issues: IssueLine[];
  requestSummary: { total: number; thirdParty: number; beforeConsent: number };
  screenshots: { label: string; dataUri: string }[];
}

export interface IssueReportData {
  type: "ISSUE";
  issues: IssueLine[];
}

export interface MonthlyMonitoringData {
  type: "MONTHLY_MONITORING";
  scansPerformed: number;
  scansSucceeded: number;
  scansPartial: number;
  scansFailed: number;
  websitesMonitored: number;
  /** Chronological score points for the trend. Nulls are PARTIAL scans, kept as gaps. */
  scoreTrend: { at: Date; score: number | null }[];
  issuesOpened: number;
  issuesResolved: number;
  openBySeverity: Record<Severity, number>;
  drift: DriftLine[];
  issues: IssueLine[];
  perWebsite: {
    websiteLabel: string;
    score: number | null;
    openIssues: number;
    lastScannedAt: Date | null;
    statusLabel: string;
  }[];
}

export interface WebsiteHealthData {
  type: "WEBSITE_HEALTH";
  score: number | null;
  scoreConfidenceLabel: string;
  breakdown: ScoreBreakdownLine[];
  consentMatrix: ConsentMatrixRow[];
  trackers: TrackerLine[];
  issues: IssueLine[];
  lastScannedAt: Date | null;
}

export interface PrivacyDriftData {
  type: "PRIVACY_DRIFT";
  events: DriftLine[];
  bySeverity: Record<Severity, number>;
}

export type ReportPayload =
  | ScanReportData
  | IssueReportData
  | MonthlyMonitoringData
  | WebsiteHealthData
  | PrivacyDriftData;

export interface ReportDocument {
  meta: ReportMeta;
  options: ReportOptions;
  /** ⚠️ Explicit, required, never ambient (§6.9). */
  branding: Branding;
  payload: ReportPayload;
  /** Optional, validated, evidence-linked. Absent is the normal case (P3). */
  aiSummary?: string | null;
}
