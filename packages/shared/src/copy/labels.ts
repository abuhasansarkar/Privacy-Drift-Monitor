import { t } from "./t";

/**
 * ENUM → LABEL MAPS — PLAN.md Part XI §11.11.
 *
 * ⚠️ SHARED BETWEEN THE APP AND THE REPORT RENDERER. The worker cannot import
 * `@/lib/labels`, and a second copy of these strings is how a finding reads
 * "Consent not respected" on screen and "CONSENT_FAILURE" in the PDF a client
 * receives. `src/lib/labels.ts` re-exports from here and adds the UI-only tone
 * maps, which have no meaning in print.
 *
 * ⚠️ `Record<Enum, string>` is the point: a Prisma enum that gains a member
 * fails to compile here rather than rendering a raw SCREAMING_CASE value.
 */

import type {
  AgencyRole,
  ConsentPhase,
  DigestFrequency,
  DriftChangeType,
  IssueCategory,
  IssueStatus,
  MonitoringStatus,
  NotificationType,
  ReportStatus,
  ReportType,
  RiskLevel,
  ScanFrequency,
  ScanStatus,
  Severity,
  SubscriptionStatus,
  TrackerCategory,
} from "@pdm/schemas";

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
  GLOBAL_PRIVACY_CONTROL: t("scans.phaseGpc"),
  INTERACTIVE_ACTION: t("scans.phaseInteractive"),
};

export const ROLE_LABEL: Record<AgencyRole, string> = {
  OWNER: t("team.roleOwner"),
  ADMIN: t("team.roleAdmin"),
  MANAGER: t("team.roleManager"),
  DEVELOPER: t("team.roleDeveloper"),
  VIEWER: t("team.roleViewer"),
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: t("severity.critical"),
  HIGH: t("severity.high"),
  MEDIUM: t("severity.medium"),
  LOW: t("severity.low"),
  INFO: t("severity.info"),
};

export const SCAN_STATUS_LABEL: Record<ScanStatus, string> = {
  QUEUED: t("scanStatus.queued"),
  RUNNING: t("scanStatus.running"),
  COMPLETED: t("scanStatus.completed"),
  PARTIAL: t("scanStatus.partial"),
  FAILED: t("scanStatus.failed"),
  CANCELLED: t("scanStatus.cancelled"),
};

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  PRE_CONSENT_TRACKING: t("issueCategory.preConsentTracking"),
  CONSENT_FAILURE: t("issueCategory.consentFailure"),
  CONSENT_MISSING: t("issueCategory.consentMissing"),
  COOKIE_BEHAVIOR: t("issueCategory.cookieBehavior"),
  NEW_TRACKER: t("issueCategory.newTracker"),
  UNKNOWN_VENDOR: t("issueCategory.unknownVendor"),
  DRIFT: t("issueCategory.drift"),
  SCAN_HEALTH: t("issueCategory.scanHealth"),
  TRANSPORT_SECURITY: t("issueCategory.transportSecurity"),
  US_CCPA: t("issueCategory.usCcpa"),
  FTC_COMPLIANCE: t("issueCategory.ftcCompliance"),
  CIPA_WIRETAP: t("issueCategory.cipaWiretap"),
  CLOAKING: t("issueCategory.cloaking"),
  STORAGE: t("issueCategory.storage"),
  TRANSPORT: t("issueCategory.transport"),
  CMP_HYGIENE: t("issueCategory.cmpHygiene"),
  INTERACTION: t("issueCategory.interaction"),
  TAG_MANAGER: t("issueCategory.tagManager"),
  FINGERPRINT: t("issueCategory.fingerprint"),
  PERFORMANCE: t("issueCategory.performance"),
  SECURITY: t("issueCategory.security"),
  POLICY: t("issueCategory.policy"),
  EU_GERMANY: t("issueCategory.euGermany"),
  EU_FRANCE: t("issueCategory.euFrance"),
  EU_ITALY: t("issueCategory.euItaly"),
  UK_PECR: t("issueCategory.ukPecr"),
};

export const TRACKER_CATEGORY_LABEL: Record<TrackerCategory, string> = {
  NECESSARY: t("trackerCategory.necessary"),
  ANALYTICS: t("trackerCategory.analytics"),
  MARKETING: t("trackerCategory.marketing"),
  ADVERTISING: t("trackerCategory.advertising"),
  FUNCTIONAL: t("trackerCategory.functional"),
  SOCIAL: t("trackerCategory.social"),
  UNKNOWN: t("trackerCategory.unknown"),
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  CRITICAL: t("riskLevel.critical"),
  HIGH: t("riskLevel.high"),
  MEDIUM: t("riskLevel.medium"),
  LOW: t("riskLevel.low"),
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  CRITICAL_ISSUE: t("notificationType.criticalIssue"),
  NEW_TRACKER: t("notificationType.newTracker"),
  CONSENT_REGRESSION: t("notificationType.consentRegression"),
  PRIVACY_DRIFT: t("notificationType.privacyDrift"),
  SCAN_FAILED: t("notificationType.scanFailed"),
  SCAN_PARTIAL: t("notificationType.scanPartial"),
  WEBSITE_UNREACHABLE: t("notificationType.websiteUnreachable"),
  REPORT_READY: t("notificationType.reportReady"),
  REPORT_FAILED: t("notificationType.reportFailed"),
  MEMBER_JOINED: t("notificationType.memberJoined"),
  TRIAL_ENDING: t("notificationType.trialEnding"),
  PAYMENT_FAILED: t("notificationType.paymentFailed"),
  PLAN_CHANGED: t("notificationType.planChanged"),
  AI_QUOTA_WARNING: t("notificationType.aiQuotaWarning"),
  USAGE_LIMIT_WARNING: t("notificationType.usageLimitWarning"),
};

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  SCAN: t("reportType.scan"),
  ISSUE: t("reportType.issue"),
  MONTHLY_MONITORING: t("reportType.monthlyMonitoring"),
  WEBSITE_HEALTH: t("reportType.websiteHealth"),
  PRIVACY_DRIFT: t("reportType.privacyDrift"),
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  QUEUED: t("reports.statusQueued"),
  GENERATING: t("reports.statusGenerating"),
  READY: t("reports.statusReady"),
  FAILED: t("reports.statusFailed"),
};

/**
 * §9.1's subscription statuses, in the customer's words.
 *
 * ⚠️ `Record<SubscriptionStatus, string>` MATTERS MORE HERE THAN ELSEWHERE. If
 * Stripe's projection ever gains a status our enum does not cover, this fails to
 * compile rather than rendering `INCOMPLETE_EXPIRED` on a billing page — and a
 * raw enum on the page that says whether somebody's service is on is the worst
 * place in the product to leak an identifier.
 */
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: t("subscriptionStatus.trialing"),
  ACTIVE: t("subscriptionStatus.active"),
  PAST_DUE: t("subscriptionStatus.pastDue"),
  CANCELED: t("subscriptionStatus.canceled"),
  UNPAID: t("subscriptionStatus.unpaid"),
  INCOMPLETE: t("subscriptionStatus.incomplete"),
  INCOMPLETE_EXPIRED: t("subscriptionStatus.incompleteExpired"),
  PAUSED: t("subscriptionStatus.paused"),
};

export const DIGEST_LABEL: Record<DigestFrequency, string> = {
  IMMEDIATE: t("digestFrequency.immediate"),
  DAILY: t("digestFrequency.daily"),
  WEEKLY: t("digestFrequency.weekly"),
  NEVER: t("digestFrequency.never"),
};

/**
 * PLAIN-WORD SEVERITY FOR THE CLIENT PORTAL — §3.13, feature doc 15.
 *
 * ⚠️ A SEPARATE MAP, NOT A TRANSFORM OF `SEVERITY_LABEL`. Persona D is
 * non-technical and never sees our internal vocabulary: five engineering
 * severities collapse to three plain phrases on purpose, and deriving one map
 * from the other would eventually leak "Critical" into a client's inbox.
 */
export const PORTAL_SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: t("portal.severityNeedsAttention"),
  HIGH: t("portal.severityNeedsAttention"),
  MEDIUM: t("portal.severityWorthReviewing"),
  LOW: t("portal.severityWorthReviewing"),
  INFO: t("portal.severityInformational"),
};

/** The three portal statuses. Everything internal collapses into them (§3.13). */
export const PORTAL_STATUS_LABEL: Record<IssueStatus, string> = {
  NEW: t("portal.statusOpen"),
  REOPENED: t("portal.statusOpen"),
  ACKNOWLEDGED: t("portal.statusInProgress"),
  IN_PROGRESS: t("portal.statusInProgress"),
  RESOLVED: t("portal.statusResolved"),
  VERIFIED: t("portal.statusResolved"),
  // Never rendered: the portal serializer filters these out entirely.
  IGNORED: t("portal.statusResolved"),
  UNVERIFIED: t("portal.statusInProgress"),
};
