import type {
  AgencyRole,
  ConsentPhase,
  DriftChangeType,
  IssueStatus,
  MonitoringStatus,
  ScanFrequency,
} from "@pdm/schemas";
import { t } from "@pdm/shared/copy";

/**
 * ENUM → LABEL maps, in one place.
 *
 * These were previously inlined per page, which is how a value ends up reading
 * "Manual" in the websites table and "MANUAL" in the Add Website wizard. A
 * `Record<Enum, string>` also fails to compile when the enum gains a member, so
 * a new scan frequency cannot ship with a missing label.
 */

export const FREQUENCY_LABEL: Record<ScanFrequency, string> = {
  DAILY: t("frequency.daily"),
  WEEKLY: t("frequency.weekly"),
  MONTHLY: t("frequency.monthly"),
  MANUAL: t("frequency.manual"),
};

export const MONITORING_LABEL: Record<MonitoringStatus, string> = {
  ACTIVE: t("monitoring.active"),
  PAUSED: t("monitoring.paused"),
  ERROR: t("monitoring.error"),
};

/** Paired with MONITORING_LABEL — colour never carries the state alone (§11.6). */
export const MONITORING_TONE = {
  ACTIVE: "success",
  PAUSED: "muted",
  ERROR: "warning",
} as const satisfies Record<MonitoringStatus, string>;

/**
 * ⚠️ The first state is NEW, not "Open".
 *
 * UI_DESIGN_PROMPTS §5.12 calls this out explicitly, and it matters because
 * "Open" reads as a binary (open/closed) while the real lifecycle has seven
 * states — including REOPENED, which is a materially different message from a
 * fresh finding: you fixed this and it came back.
 */
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  NEW: t("issueStatus.new"),
  ACKNOWLEDGED: t("issueStatus.acknowledged"),
  IN_PROGRESS: t("issueStatus.inProgress"),
  RESOLVED: t("issueStatus.resolved"),
  VERIFIED: t("issueStatus.verified"),
  IGNORED: t("issueStatus.ignored"),
  REOPENED: t("issueStatus.reopened"),
  UNVERIFIED: t("issueStatus.needsReview"),
};

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

export const DRIFT_CHANGE_LABEL: Record<DriftChangeType, string> = {
  TRACKER_ADDED: t("drift.changeTrackerAdded"),
  TRACKER_REMOVED: t("drift.changeTrackerRemoved"),
  UNKNOWN_VENDOR_ADDED: t("drift.changeUnknownVendorAdded"),
  COOKIE_ADDED: t("drift.changeCookieAdded"),
  COOKIE_REMOVED: t("drift.changeCookieRemoved"),
  THIRD_PARTY_DOMAIN_ADDED: t("drift.changeDomainAdded"),
  THIRD_PARTY_DOMAIN_REMOVED: t("drift.changeDomainRemoved"),
  SCRIPT_ADDED: t("drift.changeScriptAdded"),
  SCRIPT_REMOVED: t("drift.changeScriptRemoved"),
  CONSENT_BEHAVIOR_CHANGED: t("drift.changeConsentBehavior"),
  CONSENT_REGRESSION: t("drift.changeConsentRegression"),
  CMP_CHANGED: t("drift.changeCmpChanged"),
  CMP_REMOVED: t("drift.changeCmpRemoved"),
  TRACKER_COUNT_DELTA: t("drift.changeTrackerCountDelta"),
  SCORE_DROP: t("drift.changeScoreDrop"),
};

export const CONSENT_PHASE_LABEL: Record<ConsentPhase, string> = {
  NO_CONSENT: t("scans.phaseNoConsent"),
  REJECT_ALL: t("scans.phaseRejectAll"),
  ACCEPT_ALL: t("scans.phaseAcceptAll"),
  WITHDRAW: t("scans.phaseWithdraw"),
};

export const ROLE_LABEL: Record<AgencyRole, string> = {
  OWNER: t("team.roleOwner"),
  ADMIN: t("team.roleAdmin"),
  MANAGER: t("team.roleManager"),
  DEVELOPER: t("team.roleDeveloper"),
  VIEWER: t("team.roleViewer"),
};
