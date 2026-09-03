import type { IssueStatus, MonitoringStatus } from "@pdm/schemas";

/**
 * ENUM → LABEL maps for the app.
 *
 * ⚠️ THE LABELS THEMSELVES MOVED TO `@pdm/shared/copy/labels`, because the
 * report renderer runs in the worker and cannot import from `@/`. A second copy
 * is how a finding reads "Consent not respected" on screen and
 * "CONSENT_FAILURE" in the PDF the client receives. This file re-exports them
 * so existing imports keep working, and owns only the TONE maps — which are a
 * UI concern with no meaning in print.
 */

export {
  CONSENT_PHASE_LABEL,
  DIGEST_LABEL,
  DRIFT_CHANGE_LABEL,
  EVIDENCE_KIND_LABEL,
  FREQUENCY_LABEL,
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
  MONITORING_LABEL,
  NOTIFICATION_TYPE_LABEL,
  PORTAL_SEVERITY_LABEL,
  PORTAL_STATUS_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_TYPE_LABEL,
  RISK_LABEL,
  ROLE_LABEL,
  SCAN_STATUS_LABEL,
  SEVERITY_LABEL,
  TRACKER_CATEGORY_LABEL,
} from "@pdm/shared/copy/labels";

/**
 * ⚠️ Paired with a label, always — colour never carries the state alone
 * (§11.6, WCAG 1.4.1).
 */
export const MONITORING_TONE = {
  ACTIVE: "success",
  PAUSED: "muted",
  ERROR: "warning",
} as const satisfies Record<MonitoringStatus, string>;

/**
 * ⚠️ The first state is NEW, not "Open".
 *
 * UI_DESIGN_PROMPTS §5.12 calls this out explicitly, and it matters because
 * "Open" reads as a binary while the real lifecycle has eight states —
 * including REOPENED, which is a materially different message from a fresh
 * finding: you fixed this and it came back.
 */
export const ISSUE_STATUS_TONE = {
  NEW: "warning",
  ACKNOWLEDGED: "info",
  IN_PROGRESS: "info",
  RESOLVED: "success",
  VERIFIED: "success",
  IGNORED: "muted",
  REOPENED: "warning",
  UNVERIFIED: "muted",
} as const satisfies Record<IssueStatus, string>;

/** Report status → chip tone. `GENERATING` is in-flight, not a success. */
export const REPORT_STATUS_TONE = {
  QUEUED: "muted",
  GENERATING: "info",
  READY: "success",
  FAILED: "danger",
} as const;

/** Alert-history delivery status → chip tone. */
export const DELIVERY_TONE = {
  queued: "muted",
  sent: "info",
  delivered: "success",
  opened: "success",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
  simulated: "muted",
  suppressed_quiet_hours: "warning",
  suppressed_duplicate: "muted",
} as const;
