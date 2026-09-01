-- AlterTable
ALTER TABLE "free_scans" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "free_scan_blocklist" (
    "id" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "addedByUserId" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_scan_blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "free_scan_blocklist_registrableDomain_key" ON "free_scan_blocklist"("registrableDomain");

-- CreateIndex
CREATE INDEX "free_scan_blocklist_createdAt_idx" ON "free_scan_blocklist"("createdAt" DESC);
