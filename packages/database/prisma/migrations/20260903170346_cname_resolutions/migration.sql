-- CreateTable
CREATE TABLE "cname_resolutions" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "chain" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canonicalHost" TEXT,
    "isCloaked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cname_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cname_resolutions_scanId_isCloaked_idx" ON "cname_resolutions"("scanId", "isCloaked");

-- CreateIndex
CREATE INDEX "cname_resolutions_agencyId_idx" ON "cname_resolutions"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "cname_resolutions_scanId_host_key" ON "cname_resolutions"("scanId", "host");

-- AddForeignKey
ALTER TABLE "cname_resolutions" ADD CONSTRAINT "cname_resolutions_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
