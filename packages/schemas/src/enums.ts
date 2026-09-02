import { z } from "zod";

/**
 * SHARED ENUMS — mirror the Prisma enums in packages/database/prisma/schema.prisma.
 *
 * Duplicated deliberately: Zod validates at the API boundary before Prisma is
 * ever reached, and the worker validates job payloads without a database.
 *
 * ⚠️ `schema.prisma` IS THE SOURCE OF TRUTH. Every member list below is a
 * literal copy of the corresponding Prisma enum, in the same order. A value
 * that exists here but not there is a 500 at write time; a value that exists
 * there but not here is a 422 on input the database would have accepted.
 * When you change a Prisma enum, change it here in the same commit.
 */

export const agencyRole = z.enum([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DEVELOPER",
  "VIEWER",
]);

export const agencyStatus = z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]);

export const memberStatus = z.enum(["ACTIVE", "SUSPENDED"]);

/**
 * Archiving is `Website.archivedAt`, not a status value — a site can be
 * archived while remembering whether it was ACTIVE or PAUSED.
 */
export const monitoringStatus = z.enum(["ACTIVE", "PAUSED", "ERROR"]);

export const scanFrequency = z.enum(["DAILY", "WEEKLY", "MONTHLY", "MANUAL"]);

export const scanPriority = z.enum(["LOW", "NORMAL", "HIGH"]);

export const alertProfile = z.enum(["DEFAULT", "CRITICAL_ONLY", "SILENT"]);

export const screenshotPolicy = z.enum(["ALWAYS", "ON_CHANGE", "NEVER"]);

export const scoreConfidence = z.enum(["FULL", "PARTIAL"]);

/**
 * ⚠️ `PARTIAL` is a FIRST-CLASS outcome, not a variant of COMPLETED (P6).
 * An incomplete scan may never render a clean verdict, must never be used as a
 * drift comparison baseline, and produces an asterisked score naming the phases
 * that did not run.
 */
export const scanStatus = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export const scanTrigger = z.enum([
  "SCHEDULED",
  "MANUAL",
  "VERIFICATION",
  "ONBOARDING",
  "API",
  "FREE_PUBLIC",
]);

/** The consent journeys. Everything recorded is tagged with one of these. */
export const consentPhase = z.enum([
  "NO_CONSENT",
  "REJECT_ALL",
  "ACCEPT_ALL",
  "WITHDRAW",
  "GLOBAL_PRIVACY_CONTROL",
  "INTERACTIVE_ACTION",
]);

/**
 * Per-phase outcome (`ScanPhase.status`).
 *
 * A phase we could not execute is UNDETERMINED — never a pass. Rendering
 * "no issues found" because we failed to click Reject All would be the most
 * damaging bug this product could ship. Note there is deliberately no PASSED
 * member: EXECUTED records that the action ran, and whether the result was
 * clean is the rule engine's answer, not the phase runner's.
 */
export const phaseStatus = z.enum([
  "EXECUTED",
  "UNDETERMINED",
  "SKIPPED",
  "FAILED",
]);

export const severity = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);

export const issueCategory = z.enum([
  "PRE_CONSENT_TRACKING",
  "CONSENT_FAILURE",
  "CONSENT_MISSING",
  "COOKIE_BEHAVIOR",
  "NEW_TRACKER",
  "UNKNOWN_VENDOR",
  "DRIFT",
  "SCAN_HEALTH",
  "TRANSPORT_SECURITY",
  "US_CCPA",
  "FTC_COMPLIANCE",
  "CIPA_WIRETAP",
  "CLOAKING",
  "STORAGE",
  "TRANSPORT",
  "CMP_HYGIENE",
  "INTERACTION",
  "TAG_MANAGER",
  "FINGERPRINT",
  "PERFORMANCE",
  "SECURITY",
  "POLICY",
  "EU_GERMANY",
  "EU_FRANCE",
  "EU_ITALY",
  "UK_PECR",
]);

export const jurisdiction = z.enum([
  "GLOBAL",
  "EU_GENERAL",
  "EU_GERMANY_STRICT",
  "EU_FRANCE_CNIL",
  "EU_SPAIN_AEPD",
  "EU_ITALY_GARANTE",
  "UK_ICO",
  "US_CCPA_CALIFORNIA",
  "US_MULTI_STATE",
]);

export const geoEgressRegion = z.enum([
  "EU_CENTRAL_DE",
  "EU_WEST_FR",
  "UK_LONDON",
  "US_WEST_CA",
  "US_EAST_VA",
]);

/**
 * `UNVERIFIED` is confidence-below-threshold, shown in a separate "Needs
 * review" section rather than as an issue — one of the false-positive
 * mitigations in §12.7. Do not drop it.
 */
export const issueStatus = z.enum([
  "NEW",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "VERIFIED",
  "IGNORED",
  "REOPENED",
  "UNVERIFIED",
]);

export const issueResolution = z.enum([
  "FIXED",
  "FALSE_POSITIVE",
  "WONT_FIX",
  "EXPECTED_BEHAVIOR",
]);

export const evidenceKind = z.enum([
  "NETWORK_REQUEST",
  "COOKIE",
  "STORAGE_ENTRY",
  "SCREENSHOT",
  "CONSOLE_ERROR",
  "CONSENT_ACTION",
  "DRIFT_DIFF",
]);

export const trackerCategory = z.enum([
  "NECESSARY",
  "ANALYTICS",
  "MARKETING",
  "ADVERTISING",
  "FUNCTIONAL",
  "SOCIAL",
  "UNKNOWN",
]);

export const riskLevel = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export const driftChangeType = z.enum([
  "TRACKER_ADDED",
  "TRACKER_REMOVED",
  "UNKNOWN_VENDOR_ADDED",
  "COOKIE_ADDED",
  "COOKIE_REMOVED",
  "THIRD_PARTY_DOMAIN_ADDED",
  "THIRD_PARTY_DOMAIN_REMOVED",
  "SCRIPT_ADDED",
  "SCRIPT_REMOVED",
  "CONSENT_BEHAVIOR_CHANGED",
  "CONSENT_REGRESSION",
  "CMP_CHANGED",
  "CMP_REMOVED",
  "TRACKER_COUNT_DELTA",
  "SCORE_DROP",
]);

export const reportType = z.enum([
  "SCAN",
  "ISSUE",
  "MONTHLY_MONITORING",
  "WEBSITE_HEALTH",
  "PRIVACY_DRIFT",
]);

export const reportStatus = z.enum(["QUEUED", "GENERATING", "READY", "FAILED"]);

export const notificationType = z.enum([
  "CRITICAL_ISSUE",
  "NEW_TRACKER",
  "CONSENT_REGRESSION",
  "PRIVACY_DRIFT",
  "SCAN_FAILED",
  "SCAN_PARTIAL",
  "WEBSITE_UNREACHABLE",
  "REPORT_READY",
  "REPORT_FAILED",
  "MEMBER_JOINED",
  "TRIAL_ENDING",
  "PAYMENT_FAILED",
  "PLAN_CHANGED",
  "AI_QUOTA_WARNING",
  "USAGE_LIMIT_WARNING",
]);

export const digestFrequency = z.enum([
  "IMMEDIATE",
  "DAILY",
  "WEEKLY",
  "NEVER",
]);

export const portalUserStatus = z.enum(["INVITED", "ACTIVE", "REVOKED"]);

export const subscriptionStatus = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "UNPAID",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "PAUSED",
]);

export const billingInterval = z.enum(["MONTHLY", "ANNUAL"]);

export const usageMetric = z.enum([
  "SCANS",
  "AI_CREDITS",
  "REPORTS",
  "STORAGE_BYTES",
  "WEBSITES",
  "SEATS",
]);

export const aiModelTier = z.enum(["STANDARD", "ADVANCED"]);

export const aiFeature = z.enum([
  "EXPLAIN_ISSUE",
  "RECOMMEND_FIX",
  "SUMMARIZE_DRIFT",
  "CLIENT_MESSAGE",
  "CLASSIFY_TRACKER",
  "ROOT_CAUSE",
  "DEVELOPER_TASK",
  "WEBSITE_SUMMARY",
]);

export const aiRequestStatus = z.enum([
  "PENDING",
  "SUCCESS",
  "VALIDATION_FAILED",
  "PROVIDER_ERROR",
  "RATE_LIMITED",
  "CACHED",
]);

export type AgencyRole = z.infer<typeof agencyRole>;
export type AgencyStatus = z.infer<typeof agencyStatus>;
export type MemberStatus = z.infer<typeof memberStatus>;
export type MonitoringStatus = z.infer<typeof monitoringStatus>;
export type ScanFrequency = z.infer<typeof scanFrequency>;
export type ScanPriority = z.infer<typeof scanPriority>;
export type ScanStatus = z.infer<typeof scanStatus>;
export type ScanTrigger = z.infer<typeof scanTrigger>;
export type ConsentPhase = z.infer<typeof consentPhase>;
export type PhaseStatus = z.infer<typeof phaseStatus>;
export type Severity = z.infer<typeof severity>;
export type IssueCategory = z.infer<typeof issueCategory>;
export type IssueStatus = z.infer<typeof issueStatus>;
export type IssueResolution = z.infer<typeof issueResolution>;
export type EvidenceKind = z.infer<typeof evidenceKind>;
export type TrackerCategory = z.infer<typeof trackerCategory>;
export type RiskLevel = z.infer<typeof riskLevel>;
export type DriftChangeType = z.infer<typeof driftChangeType>;
export type ReportType = z.infer<typeof reportType>;
export type ReportStatus = z.infer<typeof reportStatus>;
export type NotificationType = z.infer<typeof notificationType>;
export type DigestFrequency = z.infer<typeof digestFrequency>;
export type PortalUserStatus = z.infer<typeof portalUserStatus>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;
export type BillingInterval = z.infer<typeof billingInterval>;
export type UsageMetric = z.infer<typeof usageMetric>;
export type AiModelTier = z.infer<typeof aiModelTier>;
export type AIFeature = z.infer<typeof aiFeature>;
export type AIRequestStatus = z.infer<typeof aiRequestStatus>;
export type Jurisdiction = z.infer<typeof jurisdiction>;
export type GeoEgressRegion = z.infer<typeof geoEgressRegion>;
