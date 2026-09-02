-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('GLOBAL', 'EU_GENERAL', 'EU_GERMANY_STRICT', 'EU_FRANCE_CNIL', 'EU_SPAIN_AEPD', 'EU_ITALY_GARANTE', 'UK_ICO', 'US_CCPA_CALIFORNIA', 'US_MULTI_STATE');

-- CreateEnum
CREATE TYPE "GeoEgressRegion" AS ENUM ('EU_CENTRAL_DE', 'EU_WEST_FR', 'UK_LONDON', 'US_WEST_CA', 'US_EAST_VA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentPhase" ADD VALUE 'GLOBAL_PRIVACY_CONTROL';
ALTER TYPE "ConsentPhase" ADD VALUE 'INTERACTIVE_ACTION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IssueCategory" ADD VALUE 'US_CCPA';
ALTER TYPE "IssueCategory" ADD VALUE 'FTC_COMPLIANCE';
ALTER TYPE "IssueCategory" ADD VALUE 'CIPA_WIRETAP';
ALTER TYPE "IssueCategory" ADD VALUE 'CLOAKING';
ALTER TYPE "IssueCategory" ADD VALUE 'STORAGE';
ALTER TYPE "IssueCategory" ADD VALUE 'TRANSPORT';
ALTER TYPE "IssueCategory" ADD VALUE 'CMP_HYGIENE';
ALTER TYPE "IssueCategory" ADD VALUE 'INTERACTION';
ALTER TYPE "IssueCategory" ADD VALUE 'TAG_MANAGER';
ALTER TYPE "IssueCategory" ADD VALUE 'FINGERPRINT';
ALTER TYPE "IssueCategory" ADD VALUE 'PERFORMANCE';
ALTER TYPE "IssueCategory" ADD VALUE 'SECURITY';
ALTER TYPE "IssueCategory" ADD VALUE 'POLICY';
ALTER TYPE "IssueCategory" ADD VALUE 'EU_GERMANY';
ALTER TYPE "IssueCategory" ADD VALUE 'EU_FRANCE';
ALTER TYPE "IssueCategory" ADD VALUE 'EU_ITALY';
ALTER TYPE "IssueCategory" ADD VALUE 'UK_PECR';

-- CreateTable
CREATE TABLE "website_jurisdiction_configs" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "primaryRegion" "Jurisdiction" NOT NULL DEFAULT 'EU_GENERAL',
    "activeRegions" "Jurisdiction"[],
    "enableGpcTest" BOOLEAN NOT NULL DEFAULT true,
    "enableCipaAudit" BOOLEAN NOT NULL DEFAULT true,
    "enablePolicyDiff" BOOLEAN NOT NULL DEFAULT true,
    "preferredEgress" "GeoEgressRegion" NOT NULL DEFAULT 'EU_CENTRAL_DE',

    CONSTRAINT "website_jurisdiction_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_audits" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "policyUrl" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "declaredVendors" TEXT[],
    "detectedVendors" TEXT[],
    "undisclosedVendors" TEXT[],
    "staleVendors" TEXT[],
    "complianceScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_replay_audits" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "unmaskedFields" TEXT[],
    "isMaskingActive" BOOLEAN NOT NULL,
    "hasPriorConsent" BOOLEAN NOT NULL,
    "riskSeverity" "Severity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_replay_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gpc_audit_records" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "gpcHeaderSent" BOOLEAN NOT NULL DEFAULT true,
    "signalAcknowledged" BOOLEAN NOT NULL,
    "trackersSuppressed" BOOLEAN NOT NULL,
    "offendingVendors" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gpc_audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_jurisdiction_configs_websiteId_key" ON "website_jurisdiction_configs"("websiteId");

-- CreateIndex
CREATE INDEX "website_jurisdiction_configs_agencyId_idx" ON "website_jurisdiction_configs"("agencyId");

-- CreateIndex
CREATE INDEX "policy_audits_agencyId_idx" ON "policy_audits"("agencyId");

-- CreateIndex
CREATE INDEX "policy_audits_websiteId_createdAt_idx" ON "policy_audits"("websiteId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "session_replay_audits_agencyId_idx" ON "session_replay_audits"("agencyId");

-- CreateIndex
CREATE INDEX "session_replay_audits_scanId_idx" ON "session_replay_audits"("scanId");

-- CreateIndex
CREATE INDEX "gpc_audit_records_agencyId_idx" ON "gpc_audit_records"("agencyId");

-- CreateIndex
CREATE INDEX "gpc_audit_records_scanId_idx" ON "gpc_audit_records"("scanId");

-- AddForeignKey
ALTER TABLE "website_jurisdiction_configs" ADD CONSTRAINT "website_jurisdiction_configs_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_audits" ADD CONSTRAINT "policy_audits_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_audits" ADD CONSTRAINT "policy_audits_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_replay_audits" ADD CONSTRAINT "session_replay_audits_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gpc_audit_records" ADD CONSTRAINT "gpc_audit_records_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
