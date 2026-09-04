-- CreateTable
CREATE TABLE "consent_mode_audits" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "isConsentModeDetected" BOOLEAN NOT NULL DEFAULT false,
    "preConsentAdStorage" TEXT,
    "preConsentAnalytics" TEXT,
    "postRejectAdStorage" TEXT,
    "postRejectAnalytics" TEXT,
    "postRejectUserData" TEXT,
    "postRejectPersonalize" TEXT,
    "issuesDetected" TEXT[],
    "rawEvents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_mode_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consent_mode_audits_scanId_key" ON "consent_mode_audits"("scanId");

-- CreateIndex
CREATE INDEX "consent_mode_audits_agencyId_idx" ON "consent_mode_audits"("agencyId");

-- AddForeignKey
ALTER TABLE "consent_mode_audits" ADD CONSTRAINT "consent_mode_audits_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_mode_audits" ADD CONSTRAINT "consent_mode_audits_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
