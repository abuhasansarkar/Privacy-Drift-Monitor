import { describe, expect, it } from "vitest";
import { generateGtmRecipe, generateCmpSnippet } from "../remediation";

describe("Remediation Engine", () => {
  describe("generateGtmRecipe", () => {
    it("generates a valid GTM container export JSON with consent initialization", () => {
      const recipe = generateGtmRecipe({
        vendorName: "Meta Pixel",
        category: "MARKETING",
        containerName: "Client Website Fix",
      });

      expect(recipe.exportFormatVersion).toBe(2);
      expect(recipe.containerVersion.container.name).toBe("Client Website Fix");
      expect(recipe.containerVersion.tag.length).toBeGreaterThanOrEqual(2);

      const defaultTag = recipe.containerVersion.tag.find((t) =>
        (t.name as string).includes("Consent Mode v2"),
      );
      expect(defaultTag).toBeDefined();

      const gatedTag = recipe.containerVersion.tag.find((t) =>
        (t.name as string).includes("Meta Pixel"),
      );
      expect(gatedTag).toBeDefined();
      expect((gatedTag?.consentSettings as Record<string, unknown>)?.consentStatus).toBe("NEEDED");
    });

    it("handles analytics category appropriately", () => {
      const recipe = generateGtmRecipe({
        vendorName: "Google Analytics 4",
        category: "ANALYTICS",
      });

      const gatedTag = recipe.containerVersion.tag.find((t) =>
        (t.name as string).includes("Google Analytics 4"),
      );
      expect(gatedTag).toBeDefined();
      expect((gatedTag?.consentSettings as Record<string, unknown>)?.consentType).toContain("analytics_storage");
    });
  });

  describe("generateCmpSnippet", () => {
    it("generates Cookiebot text/plain wrapper with data-cookieconsent", () => {
      const snippet = generateCmpSnippet({
        cmp: "cookiebot",
        vendorName: "TikTok Pixel",
        category: "MARKETING",
      });

      expect(snippet.cmp).toBe("cookiebot");
      expect(snippet.codeSnippet).toContain('type="text/plain"');
      expect(snippet.codeSnippet).toContain('data-cookieconsent="marketing"');
    });

    it("generates OneTrust wrapper with optanon class", () => {
      const snippet = generateCmpSnippet({
        cmp: "onetrust",
        vendorName: "Meta Pixel",
        category: "MARKETING",
      });

      expect(snippet.cmp).toBe("onetrust");
      expect(snippet.codeSnippet).toContain("optanon-category-C0004");
    });

    it("generates Usercentrics wrapper with data-usercentrics", () => {
      const snippet = generateCmpSnippet({
        cmp: "usercentrics",
        vendorName: "Hotjar",
        category: "ANALYTICS",
      });

      expect(snippet.cmp).toBe("usercentrics");
      expect(snippet.codeSnippet).toContain('data-usercentrics="Hotjar"');
    });

    it("generates WordPress PHP gating snippet", () => {
      const snippet = generateCmpSnippet({
        cmp: "wordpress",
        vendorName: "Facebook Pixel",
        category: "MARKETING",
      });

      expect(snippet.language).toBe("php");
      expect(snippet.codeSnippet).toContain("wp_has_consent");
    });
  });
});
