"use server";

import { revalidatePath } from "next/cache";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  assertSafeUrl,
  encryptCredentials,
  fetchAndParseSitemap,
  type UrlArchetype,
} from "@pdm/scanner";
import { requireWebsiteAccess } from "@/server/auth/context";
import { actionError, actionFromError, actionOk, type ActionResult } from "./result";

/**
 * CRAWL & AUTH-SCAN SETTINGS (F-011).
 *
 * ⚠️ EVERY ACCESS HERE IS TENANT-SCOPED, NOT JUST OWNERSHIP-CHECKED. These
 * tables used to be GLOBAL — no `agencyId`, so `forAgency()` could not scope
 * them and each access was guarded only by the `requireWebsiteAccess` call
 * above it. `AuthenticatedScanConfig` holds AES-256-GCM login credentials;
 * "the check happens to be in every caller today" is not how this product
 * protects credentials. Both models now carry `agencyId`, the tenancy test
 * enforces their listing, and every statement below runs through
 * `repositoriesFor(agencyId)` — which injects the predicate regardless of
 * what the caller remembered.
 *
 * ⚠️ `upsert` with a unique `websiteId` selector: the repository's tenant
 * extension injects `agencyId` into the unique `where`, so an upsert aimed at
 * another tenant's websiteId fails to match rather than crossing tenants.
 */

export interface DiscoveredSitemapOutput {
  discoveredUrls: string[];
  selectedUrls: string[];
  archetypes: Record<string, UrlArchetype>;
}

/**
 * Spiders the target website's sitemap.xml and clusters discovered paths into archetypes.
 */
export async function discoverSitemapAction(
  websiteId: string,
  maxPages = 5,
): Promise<ActionResult<DiscoveredSitemapOutput>> {
  try {
    const ctx = await requireWebsiteAccess(websiteId, "website:update");
    const repos = repositoriesFor(ctx.agencyId);

    const website = await repos.db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true, url: true },
    });

    const result = await fetchAndParseSitemap(website.url, {
      maxPages,
    });

    await repos.db.sitemapCrawlConfig.upsert({
      where: { websiteId },
      create: {
        websiteId,
        agencyId: ctx.agencyId,
        maxPages,
        discoveredUrls: result.discoveredUrls,
        selectedUrls: result.selectedUrls,
        lastCrawledAt: new Date(),
      },
      update: {
        maxPages,
        discoveredUrls: result.discoveredUrls,
        selectedUrls: result.selectedUrls,
        lastCrawledAt: new Date(),
      },
    });

    revalidatePath(`/app/websites/${websiteId}/crawl`);
    return actionOk({
      discoveredUrls: result.discoveredUrls,
      selectedUrls: result.selectedUrls,
      archetypes: result.archetypes,
    });
  } catch (error) {
    return actionFromError(error, "discoverSitemapAction");
  }
}

/**
 * Saves selected URLs and multi-page crawl limits.
 */
export async function saveSitemapConfigAction(
  websiteId: string,
  input: { maxPages: number; selectedUrls: string[] },
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const ctx = await requireWebsiteAccess(websiteId, "website:update");
    const repos = repositoriesFor(ctx.agencyId);

    // Verify website ownership
    await repos.db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true },
    });

    await repos.db.sitemapCrawlConfig.upsert({
      where: { websiteId },
      create: {
        websiteId,
        agencyId: ctx.agencyId,
        maxPages: input.maxPages,
        selectedUrls: input.selectedUrls,
      },
      update: {
        maxPages: input.maxPages,
        selectedUrls: input.selectedUrls,
      },
    });

    revalidatePath(`/app/websites/${websiteId}/crawl`);
    return actionOk({ success: true });
  } catch (error) {
    return actionFromError(error, "saveSitemapConfigAction");
  }
}

/**
 * Encrypts and saves behind-login authenticated scan settings.
 * Plaintext passwords are NEVER persisted or logged.
 */
export async function saveAuthConfigAction(
  websiteId: string,
  input: {
    loginUrl: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    username: string;
    password?: string;
    isActive?: boolean;
  },
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const ctx = await requireWebsiteAccess(websiteId, "website:update");
    const repos = repositoriesFor(ctx.agencyId);

    try {
      await assertSafeUrl(input.loginUrl);
    } catch {
      return actionError("SSRF_BLOCKED", "The provided login URL is not reachable or allowed.");
    }

    // Verify website ownership
    await repos.db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true },
    });

    // Check existing config to preserve password if not provided
    const existing = await repos.db.authenticatedScanConfig.findUnique({
      where: { websiteId },
    });

    let encryptedSecrets = existing?.encryptedSecrets ?? "";
    if (input.password || !existing) {
      if (!input.password) {
        return actionError("VALIDATION_ERROR", "Password is required for new authenticated scan configuration");
      }
      encryptedSecrets = encryptCredentials({
        username: input.username,
        password: input.password,
      });
    }

    await repos.db.authenticatedScanConfig.upsert({
      where: { websiteId },
      create: {
        websiteId,
        agencyId: ctx.agencyId,
        loginUrl: input.loginUrl,
        usernameSelector: input.usernameSelector,
        passwordSelector: input.passwordSelector,
        submitSelector: input.submitSelector,
        encryptedSecrets,
        isActive: input.isActive ?? true,
      },
      update: {
        loginUrl: input.loginUrl,
        usernameSelector: input.usernameSelector,
        passwordSelector: input.passwordSelector,
        submitSelector: input.submitSelector,
        encryptedSecrets,
        isActive: input.isActive !== undefined ? input.isActive : existing?.isActive ?? true,
      },
    });

    revalidatePath(`/app/websites/${websiteId}/crawl`);
    return actionOk({ success: true });
  } catch (error) {
    return actionFromError(error, "saveAuthConfigAction");
  }
}

/**
 * Toggles authenticated scanning active/inactive.
 */
export async function toggleAuthConfigAction(
  websiteId: string,
  isActive: boolean,
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const ctx = await requireWebsiteAccess(websiteId, "website:update");
    const repos = repositoriesFor(ctx.agencyId);

    await repos.db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true },
    });

    await repos.db.authenticatedScanConfig.update({
      where: { websiteId },
      data: { isActive },
    });

    revalidatePath(`/app/websites/${websiteId}/crawl`);
    return actionOk({ success: true });
  } catch (error) {
    return actionFromError(error, "toggleAuthConfigAction");
  }
}
