import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyCookie,
  clearCookieClassificationCache,
  getCookieCacheKey,
} from "../cookie-classifier";
import {
  COOKIE_CLASSIFY_V1,
  CookieClassifyOutputSchema,
} from "../prompts/cookie-classify";

describe("AI & Heuristic Cookie Classifier (Phase 17)", () => {
  beforeEach(() => {
    clearCookieClassificationCache();
  });

  describe("COOKIE_CLASSIFY_V1 Prompt & Schema", () => {
    it("has valid schema that enforces category enum and purpose", () => {
      const valid = {
        category: "ANALYTICS",
        vendorName: "Matomo",
        purpose: "Measures site visits and interaction events.",
        confidence: 0.95,
      };

      const parsed = CookieClassifyOutputSchema.parse(valid);
      expect(parsed.category).toBe("ANALYTICS");
      expect(parsed.vendorName).toBe("Matomo");

      // Rejects invalid category
      expect(() =>
        CookieClassifyOutputSchema.parse({
          ...valid,
          category: "INVALID_CAT",
        }),
      ).toThrow();
    });

    it("ensures COOKIE_CLASSIFY_V1 prompt avoids forbidden legal compliance words", () => {
      expect(COOKIE_CLASSIFY_V1.version).toBe("COOKIE_CLASSIFY_V1");
      expect(COOKIE_CLASSIFY_V1.systemPrompt).not.toMatch(/\b(?:gdpr breach|violation|non-compliant)\b/i);
    });
  });

  describe("Fast-path Known Cookie Classifier", () => {
    it("classifies _pk_id as Matomo ANALYTICS with high confidence", async () => {
      const result = await classifyCookie({
        name: "_pk_id.1.a4c3",
        domain: "example.com",
        durationDays: 365,
      });

      expect(result.category).toBe("ANALYTICS");
      expect(result.vendorName).toBe("Matomo");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("classifies _ga as Google Analytics ANALYTICS", async () => {
      const result = await classifyCookie({
        name: "_ga",
        domain: ".example.com",
        durationDays: 730,
      });

      expect(result.category).toBe("ANALYTICS");
      expect(result.vendorName).toBe("Google Analytics");
    });

    it("classifies _fbp as Meta ADVERTISING", async () => {
      const result = await classifyCookie({
        name: "_fbp",
        domain: "example.com",
        durationDays: 90,
      });

      expect(result.category).toBe("ADVERTISING");
      expect(result.vendorName).toBe("Meta");
    });

    it("classifies __cf_bm as Cloudflare NECESSARY", async () => {
      const result = await classifyCookie({
        name: "__cf_bm",
        domain: ".example.com",
        durationDays: 1,
      });

      expect(result.category).toBe("NECESSARY");
      expect(result.vendorName).toBe("Cloudflare");
    });
  });

  describe("Caching & Custom Classifier Invocation", () => {
    it("calls classifyFn for unknown cookies and caches the result for subsequent calls", async () => {
      const mockClassifyFn = vi.fn().mockResolvedValue({
        category: "ADVERTISING",
        vendorName: "TikTok Pixel",
        purpose: "Tracks conversions and user events for TikTok advertising.",
        confidence: 0.92,
      });

      const input = {
        name: "tt_pixel_session",
        domain: "example.com",
        durationDays: 30,
      };

      // 1. First invocation — calls classifyFn
      const first = await classifyCookie(input, { classifyFn: mockClassifyFn });
      expect(first.category).toBe("ADVERTISING");
      expect(first.vendorName).toBe("TikTok Pixel");
      expect(mockClassifyFn).toHaveBeenCalledTimes(1);

      // 2. Second invocation with same cookie — hits cache, does NOT call classifyFn
      const second = await classifyCookie(input, { classifyFn: mockClassifyFn });
      expect(second.category).toBe("ADVERTISING");
      expect(second.vendorName).toBe("TikTok Pixel");
      expect(mockClassifyFn).toHaveBeenCalledTimes(1); // Still 1!
    });

    it("computes normalized cache keys ignoring leading dots and casing", () => {
      const k1 = getCookieCacheKey("MyCookie", ".Example.COM");
      const k2 = getCookieCacheKey("mycookie", "example.com");
      expect(k1).toBe(k2);
      expect(k1).toBe("cookie_class:mycookie:example.com");
    });
  });
});
