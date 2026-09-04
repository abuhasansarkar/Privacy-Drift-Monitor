"use server";

import { revalidatePath } from "next/cache";
import { unsafeGlobalClient } from "@pdm/database";
import {
  assertSafeUrl,
  encryptCredentials,
  fetchAndParseSitemap,
  type UrlArchetype,
} from "@pdm/scanner";
import { requireWebsiteAccess } from "@/server/auth/context";
import { actionError, actionFromError, actionOk, type ActionResult } from "./result";

const db = unsafeGlobalClient("crawl and auth scan settings");

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

    const website = await db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true, url: true },
    });

    const result = await fetchAndParseSitemap(website.url, {
      maxPages,
    });

    await db.sitemapCrawlConfig.upsert({
      where: { websiteId },
      create: {
        websiteId,
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

    // Verify website ownership
    await db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true },
    });

    await db.sitemapCrawlConfig.upsert({
      where: { websiteId },
      create: {
        websiteId,
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

    try {
      await assertSafeUrl(input.loginUrl);
    } catch {
      return actionError("SSRF_BLOCKED", "The provided login URL is not reachable or allowed.");
    }

    // Verify website ownership
    await db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true },
    });

    // Check existing config to preserve password if not provided
    const existing = await db.authenticatedScanConfig.findUnique({
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

    await db.authenticatedScanConfig.upsert({
      where: { websiteId },
      create: {
        websiteId,
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

    await db.website.findFirstOrThrow({
      where: { id: websiteId, agencyId: ctx.agencyId },
      select: { id: true },
    });

    await db.authenticatedScanConfig.update({
      where: { websiteId },
      data: { isActive },
    });

    revalidatePath(`/app/websites/${websiteId}/crawl`);
    return actionOk({ success: true });
  } catch (error) {
    return actionFromError(error, "toggleAuthConfigAction");
  }
}
