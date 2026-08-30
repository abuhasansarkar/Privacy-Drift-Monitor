-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgencyRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ScreenshotPolicy" AS ENUM ('ALWAYS', 'ON_CHANGE', 'NEVER');

-- CreateEnum
CREATE TYPE "AiModelTier" AS ENUM ('STANDARD', 'ADVANCED');

-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "ScanFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScanPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "AlertProfile" AS ENUM ('DEFAULT', 'CRITICAL_ONLY', 'SILENT');

-- CreateEnum
CREATE TYPE "ScoreConfidence" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScanTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'VERIFICATION', 'ONBOARDING', 'API', 'FREE_PUBLIC');

-- CreateEnum
CREATE TYPE "ConsentPhase" AS ENUM ('NO_CONSENT', 'REJECT_ALL', 'ACCEPT_ALL', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('EXECUTED', 'UNDETERMINED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrackerCategory" AS ENUM ('NECESSARY', 'ANALYTICS', 'MARKETING', 'ADVERTISING', 'FUNCTIONAL', 'SOCIAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('PRE_CONSENT_TRACKING', 'CONSENT_FAILURE', 'CONSENT_MISSING', 'COOKIE_BEHAVIOR', 'NEW_TRACKER', 'UNKNOWN_VENDOR', 'DRIFT', 'SCAN_HEALTH', 'TRANSPORT_SECURITY');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'IGNORED', 'REOPENED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "IssueResolution" AS ENUM ('FIXED', 'FALSE_POSITIVE', 'WONT_FIX', 'EXPECTED_BEHAVIOR');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('NETWORK_REQUEST', 'COOKIE', 'STORAGE_ENTRY', 'SCREENSHOT', 'CONSOLE_ERROR', 'CONSENT_ACTION', 'DRIFT_DIFF');

-- CreateEnum
CREATE TYPE "DriftChangeType" AS ENUM ('TRACKER_ADDED', 'TRACKER_REMOVED', 'UNKNOWN_VENDOR_ADDED', 'COOKIE_ADDED', 'COOKIE_REMOVED', 'THIRD_PARTY_DOMAIN_ADDED', 'THIRD_PARTY_DOMAIN_REMOVED', 'SCRIPT_ADDED', 'SCRIPT_REMOVED', 'CONSENT_BEHAVIOR_CHANGED', 'CONSENT_REGRESSION', 'CMP_CHANGED', 'CMP_REMOVED', 'TRACKER_COUNT_DELTA', 'SCORE_DROP');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('SCAN', 'ISSUE', 'MONTHLY_MONITORING', 'WEBSITE_HEALTH', 'PRIVACY_DRIFT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CRITICAL_ISSUE', 'NEW_TRACKER', 'CONSENT_REGRESSION', 'PRIVACY_DRIFT', 'SCAN_FAILED', 'SCAN_PARTIAL', 'WEBSITE_UNREACHABLE', 'REPORT_READY', 'REPORT_FAILED', 'MEMBER_JOINED', 'TRIAL_ENDING', 'PAYMENT_FAILED', 'PLAN_CHANGED', 'AI_QUOTA_WARNING', 'USAGE_LIMIT_WARNING');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER');

-- CreateEnum
CREATE TYPE "PortalUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('SCANS', 'AI_CREDITS', 'REPORTS', 'STORAGE_BYTES', 'WEBSITES', 'SEATS');

-- CreateEnum
CREATE TYPE "AIFeature" AS ENUM ('EXPLAIN_ISSUE', 'RECOMMEND_FIX', 'SUMMARIZE_DRIFT', 'CLIENT_MESSAGE', 'CLASSIFY_TRACKER', 'ROOT_CAUSE', 'DEVELOPER_TASK', 'WEBSITE_SUMMARY');

-- CreateEnum
CREATE TYPE "AIRequestStatus" AS ENUM ('PENDING', 'SUCCESS', 'VALIDATION_FAILED', 'PROVIDER_ERROR', 'RATE_LIMITED', 'CACHED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "agencyType" TEXT,
    "status" "AgencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_members" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AgencyRole" NOT NULL DEFAULT 'VIEWER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "websiteScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AgencyRole" NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_branding" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "companyName" TEXT,
    "logoLightUrl" TEXT,
    "logoDarkUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "accentColor" TEXT NOT NULL DEFAULT '#0ea5e9',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "reportFooterText" TEXT,
    "customDisclaimer" TEXT,
    "portalWelcomeText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_scan_settings" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "defaultFrequency" "ScanFrequency" NOT NULL DEFAULT 'WEEKLY',
    "defaultPageLimit" INTEGER NOT NULL DEFAULT 1,
    "defaultPriority" "ScanPriority" NOT NULL DEFAULT 'NORMAL',
    "screenshotPolicy" "ScreenshotPolicy" NOT NULL DEFAULT 'ON_CHANGE',
    "respectRobots" BOOLEAN NOT NULL DEFAULT true,
    "userAgentSuffix" TEXT,
    "ignoredDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidenceRetentionDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_scan_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_ai_settings" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoExplainCritical" BOOLEAN NOT NULL DEFAULT true,
    "modelTier" "AiModelTier" NOT NULL DEFAULT 'STANDARD',
    "monthlyCreditCap" INTEGER,
    "featureToggles" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_groups" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websites" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT,
    "groupId" TEXT,
    "url" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "label" TEXT,
    "faviconUrl" TEXT,
    "monitoringStatus" "MonitoringStatus" NOT NULL DEFAULT 'ACTIVE',
    "scanFrequency" "ScanFrequency" NOT NULL DEFAULT 'WEEKLY',
    "scanPriority" "ScanPriority" NOT NULL DEFAULT 'NORMAL',
    "monitoredPaths" TEXT[] DEFAULT ARRAY['/']::TEXT[],
    "alertProfile" "AlertProfile" NOT NULL DEFAULT 'DEFAULT',
    "consentOverride" JSONB,
    "basicAuthSecretRef" TEXT,
    "respectRobots" BOOLEAN,
    "healthScore" INTEGER,
    "scoreConfidence" "ScoreConfidence",
    "lastScanId" TEXT,
    "lastScanAt" TIMESTAMP(3),
    "lastSuccessfulScanAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3),
    "baselineScanId" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "detectedCmpId" TEXT,
    "openIssueCount" INTEGER NOT NULL DEFAULT 0,
    "criticalIssueCount" INTEGER NOT NULL DEFAULT 0,
    "trackerCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "ScanTrigger" NOT NULL,
    "triggeredById" TEXT,
    "idempotencyKey" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "queueWaitMs" INTEGER,
    "scannerVersion" TEXT NOT NULL,
    "browserVersion" TEXT,
    "workerId" TEXT,
    "userAgent" TEXT,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "detectedCmpId" TEXT,
    "detectedCmpName" TEXT,
    "detectedCmpVersion" TEXT,
    "cmpConfidence" DOUBLE PRECISION,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "thirdPartyDomainCount" INTEGER NOT NULL DEFAULT 0,
    "cookieCount" INTEGER NOT NULL DEFAULT 0,
    "storageKeyCount" INTEGER NOT NULL DEFAULT 0,
    "trackerCount" INTEGER NOT NULL DEFAULT 0,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER,
    "scoreConfidence" "ScoreConfidence",
    "scoreBreakdown" JSONB,
    "fingerprints" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorPhase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_phases" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "phase" "ConsentPhase" NOT NULL,
    "status" "PhaseStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "actionMethod" TEXT,
    "actionConfidence" DOUBLE PRECISION,
    "selectorUsed" TEXT,
    "elementText" TEXT,
    "inIframe" BOOLEAN NOT NULL DEFAULT false,
    "bannerDismissed" BOOLEAN,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "scan_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_pages" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER,
    "loadTimeMs" INTEGER,
    "errorCode" TEXT,

    CONSTRAINT "scan_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_requests" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "consentPhase" "ConsentPhase" NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "isThirdParty" BOOLEAN NOT NULL,
    "status" INTEGER,
    "failureText" TEXT,
    "initiatorType" TEXT,
    "initiatorUrl" TEXT,
    "timestampMs" INTEGER NOT NULL,
    "transferSize" INTEGER,
    "redirectChain" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "setCookieCount" INTEGER NOT NULL DEFAULT 0,
    "trackerVendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookie_records" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "consentPhase" "ConsentPhase" NOT NULL,
    "snapshotPoint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isSession" BOOLEAN NOT NULL,
    "durationDays" INTEGER,
    "secure" BOOLEAN NOT NULL,
    "httpOnly" BOOLEAN NOT NULL,
    "sameSite" TEXT,
    "isThirdParty" BOOLEAN NOT NULL,
    "valueHash" TEXT,
    "valueLength" INTEGER,
    "valueRaw" TEXT,
    "trackerVendorId" TEXT,
    "category" "TrackerCategory" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cookie_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_entries" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "consentPhase" "ConsentPhase" NOT NULL,
    "storageType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueLength" INTEGER,
    "valueHash" TEXT,
    "origin" TEXT NOT NULL,
    "trackerVendorId" TEXT,

    CONSTRAINT "storage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_logs" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshots" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "consentPhase" "ConsentPhase" NOT NULL,
    "kind" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracker_vendors" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendorCompany" TEXT,
    "category" "TrackerCategory" NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "domainPatterns" TEXT[],
    "scriptPatterns" TEXT[],
    "cookiePatterns" TEXT[],
    "storagePatterns" TEXT[],
    "requestPathPatterns" TEXT[],
    "documentationUrl" TEXT,
    "privacyPolicyUrl" TEXT,
    "dataProcessingLocation" TEXT,
    "baseConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEssentialCandidate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracker_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracker_detections" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "vendorId" TEXT,
    "unknownDomain" TEXT,
    "consentPhase" "ConsentPhase" NOT NULL,
    "firstSeenAtMs" INTEGER NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "matchedVia" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "corroborated" BOOLEAN NOT NULL DEFAULT false,
    "evidenceSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "firstScanId" TEXT NOT NULL,
    "lastScanId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "category" "IssueCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'NEW',
    "confidence" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "technicalReason" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "assignedToId" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" "IssueResolution",
    "resolutionNote" TEXT,
    "ignoredAt" TIMESTAMP(3),
    "ignoredById" TEXT,
    "ignoreReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationScanId" TEXT,
    "driftEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_evidence" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "consentPhase" "ConsentPhase" NOT NULL,
    "observedAtMs" INTEGER NOT NULL,
    "detectionRuleId" TEXT NOT NULL,
    "detectionRuleVersion" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "payload" JSONB NOT NULL,
    "s3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_activities" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_feedback" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ignore_rules" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT,
    "scope" TEXT NOT NULL,
    "ruleId" TEXT,
    "vendorId" TEXT,
    "fingerprint" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ignore_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_drift_events" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "currentScanId" TEXT NOT NULL,
    "previousScanId" TEXT NOT NULL,
    "changeType" "DriftChangeType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "summary" TEXT NOT NULL,
    "addedItems" JSONB NOT NULL DEFAULT '[]',
    "removedItems" JSONB NOT NULL DEFAULT '[]',
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "issueId" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedById" TEXT,
    "aiSummary" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_drift_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_suppressions" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "changeType" "DriftChangeType" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT,
    "websiteId" TEXT,
    "createdById" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "options" JSONB NOT NULL DEFAULT '{}',
    "brandingSnapshot" JSONB,
    "idempotencyKey" TEXT,
    "s3Key" TEXT,
    "sizeBytes" INTEGER,
    "pageCount" INTEGER,
    "generatedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_shares" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "digest" "DigestFrequency" NOT NULL DEFAULT 'IMMEDIATE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "triggerTypes" "NotificationType"[],
    "minSeverity" "Severity" NOT NULL DEFAULT 'HIGH',
    "channels" TEXT[] DEFAULT ARRAY['email', 'in_app']::TEXT[],
    "digest" "DigestFrequency" NOT NULL DEFAULT 'IMMEDIATE',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT,
    "agencyId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" TEXT NOT NULL,
    "recipients" TEXT[],
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_users" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "PortalUserStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" TEXT NOT NULL,
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stripeProductId" TEXT,
    "stripePriceMonthlyId" TEXT,
    "stripePriceAnnualId" TEXT,
    "priceMonthlyCents" INTEGER NOT NULL,
    "priceAnnualCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "entitlements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "entitlementOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "AIFeature" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AIRequestStatus" NOT NULL DEFAULT 'PENDING',
    "entityType" TEXT,
    "entityId" TEXT,
    "issueId" TEXT,
    "inputHash" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costMicroCents" INTEGER,
    "latencyMs" INTEGER,
    "output" JSONB,
    "validationErrors" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "fromCache" BOOLEAN NOT NULL DEFAULT false,
    "feedbackScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "userId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "planKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "agencyId" TEXT,
    "scanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_scans" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "healthScore" INTEGER,
    "resultSummary" JSONB,
    "email" TEXT,
    "convertedAgencyId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "free_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "users"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_clerkUserId_idx" ON "users"("clerkUserId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_clerkOrgId_key" ON "agencies"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

-- CreateIndex
CREATE INDEX "agencies_clerkOrgId_idx" ON "agencies"("clerkOrgId");

-- CreateIndex
CREATE INDEX "agencies_slug_idx" ON "agencies"("slug");

-- CreateIndex
CREATE INDEX "agencies_status_idx" ON "agencies"("status");

-- CreateIndex
CREATE INDEX "agency_members_agencyId_role_idx" ON "agency_members"("agencyId", "role");

-- CreateIndex
CREATE INDEX "agency_members_userId_idx" ON "agency_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_members_agencyId_userId_key" ON "agency_members"("agencyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_expiresAt_idx" ON "invitations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_agencyId_email_key" ON "invitations"("agencyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "agency_branding_agencyId_key" ON "agency_branding"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_scan_settings_agencyId_key" ON "agency_scan_settings"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_ai_settings_agencyId_key" ON "agency_ai_settings"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_agencyId_key_key" ON "user_preferences"("userId", "agencyId", "key");

-- CreateIndex
CREATE INDEX "clients_agencyId_archivedAt_idx" ON "clients"("agencyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_agencyId_slug_key" ON "clients"("agencyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "website_groups_agencyId_name_key" ON "website_groups"("agencyId", "name");

-- CreateIndex
CREATE INDEX "websites_agencyId_monitoringStatus_archivedAt_idx" ON "websites"("agencyId", "monitoringStatus", "archivedAt");

-- CreateIndex
CREATE INDEX "websites_agencyId_clientId_idx" ON "websites"("agencyId", "clientId");

-- CreateIndex
CREATE INDEX "websites_agencyId_healthScore_idx" ON "websites"("agencyId", "healthScore");

-- CreateIndex
CREATE INDEX "websites_nextScanAt_monitoringStatus_idx" ON "websites"("nextScanAt", "monitoringStatus");

-- CreateIndex
CREATE INDEX "websites_registrableDomain_idx" ON "websites"("registrableDomain");

-- CreateIndex
CREATE UNIQUE INDEX "websites_agencyId_url_key" ON "websites"("agencyId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "scans_idempotencyKey_key" ON "scans"("idempotencyKey");

-- CreateIndex
CREATE INDEX "scans_agencyId_createdAt_idx" ON "scans"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "scans_websiteId_createdAt_idx" ON "scans"("websiteId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "scans_websiteId_status_finishedAt_idx" ON "scans"("websiteId", "status", "finishedAt" DESC);

-- CreateIndex
CREATE INDEX "scans_status_queuedAt_idx" ON "scans"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "scan_phases_scanId_idx" ON "scan_phases"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "scan_phases_scanId_phase_key" ON "scan_phases"("scanId", "phase");

-- CreateIndex
CREATE INDEX "scan_pages_scanId_idx" ON "scan_pages"("scanId");

-- CreateIndex
CREATE INDEX "network_requests_scanId_consentPhase_idx" ON "network_requests"("scanId", "consentPhase");

-- CreateIndex
CREATE INDEX "network_requests_scanId_isThirdParty_idx" ON "network_requests"("scanId", "isThirdParty");

-- CreateIndex
CREATE INDEX "network_requests_scanId_registrableDomain_idx" ON "network_requests"("scanId", "registrableDomain");

-- CreateIndex
CREATE INDEX "network_requests_scanId_trackerVendorId_idx" ON "network_requests"("scanId", "trackerVendorId");

-- CreateIndex
CREATE INDEX "cookie_records_scanId_consentPhase_idx" ON "cookie_records"("scanId", "consentPhase");

-- CreateIndex
CREATE INDEX "cookie_records_scanId_category_idx" ON "cookie_records"("scanId", "category");

-- CreateIndex
CREATE INDEX "cookie_records_scanId_name_idx" ON "cookie_records"("scanId", "name");

-- CreateIndex
CREATE INDEX "storage_entries_scanId_consentPhase_idx" ON "storage_entries"("scanId", "consentPhase");

-- CreateIndex
CREATE INDEX "console_logs_scanId_idx" ON "console_logs"("scanId");

-- CreateIndex
CREATE INDEX "screenshots_scanId_consentPhase_idx" ON "screenshots"("scanId", "consentPhase");

-- CreateIndex
CREATE UNIQUE INDEX "tracker_vendors_slug_key" ON "tracker_vendors"("slug");

-- CreateIndex
CREATE INDEX "tracker_vendors_category_idx" ON "tracker_vendors"("category");

-- CreateIndex
CREATE INDEX "tracker_vendors_slug_idx" ON "tracker_vendors"("slug");

-- CreateIndex
CREATE INDEX "tracker_detections_scanId_consentPhase_idx" ON "tracker_detections"("scanId", "consentPhase");

-- CreateIndex
CREATE INDEX "tracker_detections_websiteId_vendorId_idx" ON "tracker_detections"("websiteId", "vendorId");

-- CreateIndex
CREATE INDEX "tracker_detections_agencyId_vendorId_idx" ON "tracker_detections"("agencyId", "vendorId");

-- CreateIndex
CREATE INDEX "tracker_detections_unknownDomain_idx" ON "tracker_detections"("unknownDomain");

-- CreateIndex
CREATE INDEX "issues_agencyId_status_severity_idx" ON "issues"("agencyId", "status", "severity");

-- CreateIndex
CREATE INDEX "issues_agencyId_createdAt_idx" ON "issues"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "issues_websiteId_status_idx" ON "issues"("websiteId", "status");

-- CreateIndex
CREATE INDEX "issues_assignedToId_status_idx" ON "issues"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "issues_ruleId_idx" ON "issues"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "issues_websiteId_fingerprint_key" ON "issues"("websiteId", "fingerprint");

-- CreateIndex
CREATE INDEX "issue_evidence_issueId_idx" ON "issue_evidence"("issueId");

-- CreateIndex
CREATE INDEX "issue_evidence_scanId_idx" ON "issue_evidence"("scanId");

-- CreateIndex
CREATE INDEX "issue_evidence_agencyId_idx" ON "issue_evidence"("agencyId");

-- CreateIndex
CREATE INDEX "issue_activities_issueId_createdAt_idx" ON "issue_activities"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_feedback_ruleId_verdict_idx" ON "issue_feedback"("ruleId", "verdict");

-- CreateIndex
CREATE INDEX "ignore_rules_agencyId_websiteId_idx" ON "ignore_rules"("agencyId", "websiteId");

-- CreateIndex
CREATE INDEX "privacy_drift_events_agencyId_detectedAt_idx" ON "privacy_drift_events"("agencyId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "privacy_drift_events_websiteId_detectedAt_idx" ON "privacy_drift_events"("websiteId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "privacy_drift_events_agencyId_changeType_detectedAt_idx" ON "privacy_drift_events"("agencyId", "changeType", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "privacy_drift_events_agencyId_severity_detectedAt_idx" ON "privacy_drift_events"("agencyId", "severity", "detectedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "drift_suppressions_websiteId_changeType_fingerprint_key" ON "drift_suppressions"("websiteId", "changeType", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "reports_idempotencyKey_key" ON "reports"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reports_agencyId_createdAt_idx" ON "reports"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reports_agencyId_clientId_idx" ON "reports"("agencyId", "clientId");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "report_shares_token_key" ON "report_shares"("token");

-- CreateIndex
CREATE INDEX "report_shares_token_idx" ON "report_shares"("token");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_agencyId_createdAt_idx" ON "notifications"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_agencyId_type_key" ON "notification_preferences"("userId", "agencyId", "type");

-- CreateIndex
CREATE INDEX "alert_rules_agencyId_enabled_idx" ON "alert_rules"("agencyId", "enabled");

-- CreateIndex
CREATE INDEX "alert_history_agencyId_createdAt_idx" ON "alert_history"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_inviteToken_key" ON "portal_users"("inviteToken");

-- CreateIndex
CREATE INDEX "portal_users_agencyId_idx" ON "portal_users"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_clientId_email_key" ON "portal_users"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_tokenHash_key" ON "portal_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_sessions_tokenHash_idx" ON "portal_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_sessions_expiresAt_idx" ON "portal_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_agencyId_key" ON "subscriptions"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_stripeCustomerId_idx" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "usage_records_agencyId_metric_idx" ON "usage_records"("agencyId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_agencyId_periodStart_metric_key" ON "usage_records"("agencyId", "periodStart", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_type_createdAt_idx" ON "stripe_webhook_events"("type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stripe_webhook_events_status_idx" ON "stripe_webhook_events"("status");

-- CreateIndex
CREATE INDEX "ai_requests_agencyId_createdAt_idx" ON "ai_requests"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_requests_agencyId_feature_idx" ON "ai_requests"("agencyId", "feature");

-- CreateIndex
CREATE INDEX "ai_requests_inputHash_idx" ON "ai_requests"("inputHash");

-- CreateIndex
CREATE INDEX "ai_requests_status_idx" ON "ai_requests"("status");

-- CreateIndex
CREATE INDEX "audit_logs_agencyId_createdAt_idx" ON "audit_logs"("agencyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_overrides_flagId_agencyId_key" ON "feature_flag_overrides"("flagId", "agencyId");

-- CreateIndex
CREATE INDEX "system_logs_level_createdAt_idx" ON "system_logs"("level", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_logs_service_createdAt_idx" ON "system_logs"("service", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "free_scans_token_key" ON "free_scans"("token");

-- CreateIndex
CREATE INDEX "free_scans_token_idx" ON "free_scans"("token");

-- CreateIndex
CREATE INDEX "free_scans_registrableDomain_createdAt_idx" ON "free_scans"("registrableDomain", "createdAt");

-- CreateIndex
CREATE INDEX "free_scans_ipHash_createdAt_idx" ON "free_scans"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "free_scans_expiresAt_idx" ON "free_scans"("expiresAt");

-- AddForeignKey
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_branding" ADD CONSTRAINT "agency_branding_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_scan_settings" ADD CONSTRAINT "agency_scan_settings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_ai_settings" ADD CONSTRAINT "agency_ai_settings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_groups" ADD CONSTRAINT "website_groups_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "website_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_phases" ADD CONSTRAINT "scan_phases_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_pages" ADD CONSTRAINT "scan_pages_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_requests" ADD CONSTRAINT "network_requests_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookie_records" ADD CONSTRAINT "cookie_records_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_entries" ADD CONSTRAINT "storage_entries_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_logs" ADD CONSTRAINT "console_logs_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_detections" ADD CONSTRAINT "tracker_detections_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_detections" ADD CONSTRAINT "tracker_detections_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "tracker_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_lastScanId_fkey" FOREIGN KEY ("lastScanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_evidence" ADD CONSTRAINT "issue_evidence_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_evidence" ADD CONSTRAINT "issue_evidence_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_feedback" ADD CONSTRAINT "issue_feedback_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ignore_rules" ADD CONSTRAINT "ignore_rules_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ignore_rules" ADD CONSTRAINT "ignore_rules_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_drift_events" ADD CONSTRAINT "privacy_drift_events_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_drift_events" ADD CONSTRAINT "privacy_drift_events_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_drift_events" ADD CONSTRAINT "privacy_drift_events_currentScanId_fkey" FOREIGN KEY ("currentScanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_drift_events" ADD CONSTRAINT "privacy_drift_events_previousScanId_fkey" FOREIGN KEY ("previousScanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_suppressions" ADD CONSTRAINT "drift_suppressions_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_suppressions" ADD CONSTRAINT "drift_suppressions_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
