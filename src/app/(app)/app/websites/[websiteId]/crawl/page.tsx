import { notFound } from "next/navigation";
import { unsafeGlobalClient } from "@pdm/database";
import { requireWebsiteAccess } from "@/server/auth/context";
import { CrawlSettingsView } from "./crawl-settings-view";

const db = unsafeGlobalClient("website crawl settings page");

export default async function WebsiteCrawlPage({
  params,
}: PageProps<"/app/websites/[websiteId]/crawl">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);

  const website = await db.website.findFirst({
    where: {
      id: websiteId,
      agencyId: ctx.agencyId,
      archivedAt: null,
    },
    include: {
      sitemapConfig: true,
      authScanConfig: true,
    },
  });

  if (!website) {
    notFound();
  }

  return (
    <CrawlSettingsView
      websiteId={website.id}
      websiteUrl={website.url}
      sitemapConfig={
        website.sitemapConfig
          ? {
              maxPages: website.sitemapConfig.maxPages,
              discoveredUrls: website.sitemapConfig.discoveredUrls,
              selectedUrls: website.sitemapConfig.selectedUrls,
              lastCrawledAt: website.sitemapConfig.lastCrawledAt,
            }
          : null
      }
      authConfig={
        website.authScanConfig
          ? {
              loginUrl: website.authScanConfig.loginUrl,
              usernameSelector: website.authScanConfig.usernameSelector,
              passwordSelector: website.authScanConfig.passwordSelector,
              submitSelector: website.authScanConfig.submitSelector,
              isActive: website.authScanConfig.isActive,
              hasSecrets: Boolean(website.authScanConfig.encryptedSecrets),
            }
          : null
      }
    />
  );
}
