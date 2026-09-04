import { describe, expect, it, vi } from "vitest";
import {
  classifyUrlArchetype,
  extractLocsFromXml,
  fetchAndParseSitemap,
  isSitemapIndex,
  selectDiverseArchetypalUrls,
} from "../spider/sitemap";

describe("Sitemap Parser & Archetype Spider", () => {
  const baseUrl = "https://example.com";

  describe("classifyUrlArchetype", () => {
    it("correctly identifies HOME archetype", () => {
      expect(classifyUrlArchetype("https://example.com/", baseUrl)).toBe("HOME");
      expect(classifyUrlArchetype("https://example.com", baseUrl)).toBe("HOME");
    });

    it("correctly identifies CART archetype", () => {
      expect(classifyUrlArchetype("https://example.com/cart", baseUrl)).toBe("CART");
      expect(classifyUrlArchetype("https://example.com/basket", baseUrl)).toBe("CART");
      expect(classifyUrlArchetype("https://example.com/shopping-bag/", baseUrl)).toBe("CART");
    });

    it("correctly identifies CHECKOUT archetype", () => {
      expect(classifyUrlArchetype("https://example.com/checkout", baseUrl)).toBe("CHECKOUT");
      expect(classifyUrlArchetype("https://example.com/order/pay", baseUrl)).toBe("CHECKOUT");
      expect(classifyUrlArchetype("https://example.com/payment/", baseUrl)).toBe("CHECKOUT");
    });

    it("correctly identifies FORM archetype", () => {
      expect(classifyUrlArchetype("https://example.com/contact-us", baseUrl)).toBe("FORM");
      expect(classifyUrlArchetype("https://example.com/signup", baseUrl)).toBe("FORM");
      expect(classifyUrlArchetype("https://example.com/support/inquiry", baseUrl)).toBe("FORM");
    });

    it("correctly identifies BLOG archetype", () => {
      expect(classifyUrlArchetype("https://example.com/blog/article-1", baseUrl)).toBe("BLOG");
      expect(classifyUrlArchetype("https://example.com/news/latest", baseUrl)).toBe("BLOG");
      expect(classifyUrlArchetype("https://example.com/posts/privacy-guide", baseUrl)).toBe("BLOG");
    });

    it("falls back to GENERIC for uncategorized content pages", () => {
      expect(classifyUrlArchetype("https://example.com/about-us", baseUrl)).toBe("GENERIC");
      expect(classifyUrlArchetype("https://example.com/team", baseUrl)).toBe("GENERIC");
    });
  });

  describe("extractLocsFromXml & isSitemapIndex", () => {
    it("extracts loc tags from standard sitemap XML", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc><![CDATA[https://example.com/cart]]></loc></url>
        <url><loc>https://example.com/checkout</loc></url>
      </urlset>`;

      expect(isSitemapIndex(xml)).toBe(false);
      const locs = extractLocsFromXml(xml);
      expect(locs).toEqual([
        "https://example.com/",
        "https://example.com/cart",
        "https://example.com/checkout",
      ]);
    });

    it("detects sitemap index XML", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
      </sitemapindex>`;

      expect(isSitemapIndex(xml)).toBe(true);
      const locs = extractLocsFromXml(xml);
      expect(locs).toHaveLength(2);
    });
  });

  describe("selectDiverseArchetypalUrls", () => {
    it("greedily picks diverse archetypes without infinite recursion or duplicates", () => {
      const urls = [
        "https://example.com/blog/1",
        "https://example.com/blog/2",
        "https://example.com/blog/3",
        "https://example.com/cart",
        "https://example.com/checkout",
        "https://example.com/contact-us",
        "https://example.com/pricing",
      ];

      const { selectedUrls, archetypes } = selectDiverseArchetypalUrls(urls, baseUrl, 5);

      expect(selectedUrls.length).toBe(5);
      // Contains HOME
      expect(selectedUrls).toContain("https://example.com/");
      // Contains 1 CART
      expect(selectedUrls).toContain("https://example.com/cart");
      // Contains 1 CHECKOUT
      expect(selectedUrls).toContain("https://example.com/checkout");
      // Contains 1 FORM
      expect(selectedUrls).toContain("https://example.com/contact-us");
      // Contains 1 BLOG
      expect(selectedUrls).toContain("https://example.com/blog/1");
      // Does not contain second blog when limit is 5
      expect(selectedUrls).not.toContain("https://example.com/blog/2");

      expect(archetypes["https://example.com/"]).toBe("HOME");
      expect(archetypes["https://example.com/cart"]).toBe("CART");
    });
  });

  describe("fetchAndParseSitemap", () => {
    it("fetches, parses, and clusters sitemap into archetypes", async () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/cart</loc></url>
        <url><loc>https://example.com/checkout</loc></url>
        <url><loc>https://example.com/contact</loc></url>
        <url><loc>https://example.com/blog/post-1</loc></url>
      </urlset>`;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => sampleXml,
      } as unknown as Response);

      const result = await fetchAndParseSitemap("https://example.com", {
        fetchFn: mockFetch as unknown as typeof fetch,
        maxPages: 5,
      });

      expect(result.discoveredUrls).toHaveLength(5);
      expect(result.selectedUrls).toHaveLength(5);
      expect(result.archetypes["https://example.com/checkout"]).toBe("CHECKOUT");
    });
  });
});
