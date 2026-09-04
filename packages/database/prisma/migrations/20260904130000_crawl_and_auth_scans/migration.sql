-- CreateTable
CREATE TABLE "sitemap_crawl_configs" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL DEFAULT 5,
    "discoveredUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastCrawledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sitemap_crawl_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authenticated_scan_configs" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "loginUrl" TEXT NOT NULL,
    "usernameSelector" TEXT NOT NULL,
    "passwordSelector" TEXT NOT NULL,
    "submitSelector" TEXT NOT NULL,
    "encryptedSecrets" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authenticated_scan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitemap_crawl_configs_websiteId_key" ON "sitemap_crawl_configs"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "authenticated_scan_configs_websiteId_key" ON "authenticated_scan_configs"("websiteId");

-- AddForeignKey
ALTER TABLE "sitemap_crawl_configs" ADD CONSTRAINT "sitemap_crawl_configs_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticated_scan_configs" ADD CONSTRAINT "authenticated_scan_configs_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
