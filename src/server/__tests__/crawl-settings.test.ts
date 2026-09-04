import { beforeEach, describe, expect, it, vi } from "vitest";
import { unsafeGlobalClient } from "@pdm/database";
import {
  discoverSitemapAction,
  saveAuthConfigAction,
  saveSitemapConfigAction,
  toggleAuthConfigAction,
} from "../actions/crawl-settings";

vi.mock("@/server/auth/context", () => ({
  requireWebsiteAccess: vi.fn().mockResolvedValue({
    agencyId: "agency-crawl-test",
    userId: "user-1",
    role: "AGENCY_ADMIN",
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const mockAgencyId = "agency-crawl-test";

// Mock sitemap fetching
vi.mock("@pdm/scanner", async () => {
  const actual = await vi.importActual<typeof import("@pdm/scanner")>("@pdm/scanner");
  return {
    ...actual,
    fetchAndParseSitemap: vi.fn().mockResolvedValue({
      discoveredUrls: [
        "https://example-test.com/",
        "https://example-test.com/cart",
        "https://example-test.com/checkout",
        "https://example-test.com/contact",
      ],
      selectedUrls: [
        "https://example-test.com/",
        "https://example-test.com/cart",
        "https://example-test.com/checkout",
        "https://example-test.com/contact",
      ],
      archetypes: {
        "https://example-test.com/": "HOME",
        "https://example-test.com/cart": "CART",
        "https://example-test.com/checkout": "CHECKOUT",
        "https://example-test.com/contact": "FORM",
      },
    }),
  };
});

describe("Website Crawl & Auth Settings Actions", () => {
  const db = unsafeGlobalClient("crawl settings test");
  let testWebsiteId: string;

  beforeEach(async () => {
    // Ensure agency exists
    await db.agency.upsert({
      where: { id: mockAgencyId },
      create: {
        id: mockAgencyId,
        name: "Crawl Test Agency",
        slug: `crawl-agency-${Date.now()}`,
        clerkOrgId: `org_${Date.now()}`,
      },
      update: {},
    });

    // Create test website
    const siteUrl = `https://example-test-${Date.now()}.com`;
    const site = await db.website.create({
      data: {
        agencyId: mockAgencyId,
        url: siteUrl,
        originalUrl: siteUrl,
        host: "example-test.com",
        registrableDomain: "example-test.com",
      },
    });
    testWebsiteId = site.id;
  });

  it("spiders sitemap and saves discovered and selected URLs", async () => {
    const res = await discoverSitemapAction(testWebsiteId, 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.discoveredUrls).toHaveLength(4);
    expect(res.data.selectedUrls).toHaveLength(4);

    const saved = await db.sitemapCrawlConfig.findUnique({
      where: { websiteId: testWebsiteId },
    });
    expect(saved).not.toBeNull();
    expect(saved?.discoveredUrls).toHaveLength(4);
  });

  it("saves custom multi-page crawl selection", async () => {
    const selected = ["https://example-test.com/", "https://example-test.com/checkout"];
    const res = await saveSitemapConfigAction(testWebsiteId, {
      maxPages: 3,
      selectedUrls: selected,
    });

    expect(res.ok).toBe(true);

    const saved = await db.sitemapCrawlConfig.findUnique({
      where: { websiteId: testWebsiteId },
    });
    expect(saved?.maxPages).toBe(3);
    expect(saved?.selectedUrls).toEqual(selected);
  });

  it("blocks SSRF loopback URLs when configuring authenticated scanning", async () => {
    const res = await saveAuthConfigAction(testWebsiteId, {
      loginUrl: "http://127.0.0.1:8080/login",
      usernameSelector: "#user",
      passwordSelector: "#pass",
      submitSelector: "#btn",
      username: "admin",
      password: "secretpassword",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("SSRF_BLOCKED");
    }
  });

  it("encrypts secrets and saves authenticated scan configuration", async () => {
    const res = await saveAuthConfigAction(testWebsiteId, {
      loginUrl: "https://example-test.com/login",
      usernameSelector: "#user",
      passwordSelector: "#pass",
      submitSelector: "#btn",
      username: "audit_bot",
      password: "SuperSecretPassword!",
      isActive: true,
    });

    expect(res.ok).toBe(true);

    const saved = await db.authenticatedScanConfig.findUnique({
      where: { websiteId: testWebsiteId },
    });
    expect(saved).not.toBeNull();
    expect(saved?.isActive).toBe(true);
    // Plaintext password never stored
    expect(saved?.encryptedSecrets).not.toContain("SuperSecretPassword!");
    expect(saved?.encryptedSecrets).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

    // Toggle active
    const toggleRes = await toggleAuthConfigAction(testWebsiteId, false);
    expect(toggleRes.ok).toBe(true);

    const toggled = await db.authenticatedScanConfig.findUnique({
      where: { websiteId: testWebsiteId },
    });
    expect(toggled?.isActive).toBe(false);
  });
});
