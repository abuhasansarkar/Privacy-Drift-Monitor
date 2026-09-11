/*
  Warnings:

  - Added the required column `agencyId` to the `authenticated_scan_configs` table.
  - Added the required column `agencyId` to the `sitemap_crawl_configs` table.

  F-011: both tables were GLOBAL (no tenant scope) while carrying crawl config
  and AES-256-GCM login credentials. The column is added NULLABLE, backfilled
  from the website relation (the only source of truth for who owns the row),
  then made NOT NULL — the expand/contract sequence for a required column on
  a table that may hold rows. Rows whose website no longer resolves (orphans)
  are deleted, since a config without an owning website is dead either way.
*/

-- AlterTable (nullable first, so existing rows survive the ALTER)
ALTER TABLE "authenticated_scan_configs" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "sitemap_crawl_configs" ADD COLUMN "agencyId" TEXT;

-- Backfill from the website relation.
UPDATE "authenticated_scan_configs" c
SET "agencyId" = w."agencyId"
FROM "websites" w
WHERE c."websiteId" = w."id";

UPDATE "sitemap_crawl_configs" c
SET "agencyId" = w."agencyId"
FROM "websites" w
WHERE c."websiteId" = w."id";

-- Orphaned configs (website gone) cannot be scoped; they are dead rows.
DELETE FROM "authenticated_scan_configs" WHERE "agencyId" IS NULL;
DELETE FROM "sitemap_crawl_configs" WHERE "agencyId" IS NULL;

-- Contract: the column is now required.
ALTER TABLE "authenticated_scan_configs" ALTER COLUMN "agencyId" SET NOT NULL;
ALTER TABLE "sitemap_crawl_configs" ALTER COLUMN "agencyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "authenticated_scan_configs_agencyId_idx" ON "authenticated_scan_configs"("agencyId");

-- CreateIndex
CREATE INDEX "sitemap_crawl_configs_agencyId_idx" ON "sitemap_crawl_configs"("agencyId");

-- AddForeignKey
ALTER TABLE "sitemap_crawl_configs" ADD CONSTRAINT "sitemap_crawl_configs_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticated_scan_configs" ADD CONSTRAINT "authenticated_scan_configs_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
