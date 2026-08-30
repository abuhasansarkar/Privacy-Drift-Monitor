import { describe, expect, it } from "vitest";
import {
  isSameMonitoredUrl,
  normalizeWebsiteUrl,
  UrlNormalizationError,
} from "../normalize";

/**
 * URL NORMALIZATION — PLAN.md Part III §3.6, Phase 1 task 1.7.
 */

describe("scheme handling", () => {
  it("assumes https for a bare domain", () => {
    expect(normalizeWebsiteUrl("example.com").url).toBe("https://example.com");
  });

  it("upgrades http to https for probing and records that it did", () => {
    const result = normalizeWebsiteUrl("http://example.com");
    expect(result.url).toBe("https://example.com");
    expect(result.upgradedToHttps).toBe(true);
    // The caller downgrades and raises PDM-R022 if only HTTP answers.
  });

  it("does not flag an https input as upgraded", () => {
    expect(normalizeWebsiteUrl("https://example.com").upgradedToHttps).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizeWebsiteUrl("ftp://example.com")).toThrow(UrlNormalizationError);
    expect(() => normalizeWebsiteUrl("javascript:alert(1)")).toThrow(
      UrlNormalizationError,
    );
  });
});

describe("host handling", () => {
  it("lowercases the host", () => {
    expect(normalizeWebsiteUrl("https://EXAMPLE.COM").host).toBe("example.com");
  });

  it("PRESERVES www — www.x.com and x.com can behave differently", () => {
    // Stripping it would merge two sites with potentially different tracking
    // profiles into one monitored record (§3.6).
    expect(normalizeWebsiteUrl("https://www.example.com").host).toBe(
      "www.example.com",
    );
    expect(isSameMonitoredUrl("https://www.example.com", "https://example.com")).toBe(
      false,
    );
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeWebsiteUrl("https://user:pass@example.com")).toThrow(
      UrlNormalizationError,
    );
  });
});

describe("registrable domain (eTLD+1)", () => {
  it("handles a simple TLD", () => {
    expect(normalizeWebsiteUrl("https://www.example.com").registrableDomain).toBe(
      "example.com",
    );
  });

  it("handles multi-part public suffixes via the PSL, not the last two labels", () => {
    // Naive "last two labels" would give "co.uk", which is not a site.
    expect(normalizeWebsiteUrl("https://shop.acmedental.co.uk").registrableDomain).toBe(
      "acmedental.co.uk",
    );
    expect(normalizeWebsiteUrl("https://a.b.example.com.au").registrableDomain).toBe(
      "example.com.au",
    );
  });

  it("rejects input with no registrable domain", () => {
    expect(() => normalizeWebsiteUrl("https://localhost")).toThrow(
      UrlNormalizationError,
    );
    expect(() => normalizeWebsiteUrl("https://127.0.0.1")).toThrow(
      UrlNormalizationError,
    );
  });
});

describe("path, port and fragment", () => {
  it("strips the trailing slash on the root path only", () => {
    expect(normalizeWebsiteUrl("https://example.com/").url).toBe("https://example.com");
  });

  it("preserves a user-supplied path", () => {
    // Some clients monitor a specific landing page.
    const result = normalizeWebsiteUrl("https://example.com/landing/offer");
    expect(result.url).toBe("https://example.com/landing/offer");
    expect(result.hasExplicitPath).toBe(true);
  });

  it("strips a trailing slash from a supplied path", () => {
    expect(normalizeWebsiteUrl("https://example.com/landing/").url).toBe(
      "https://example.com/landing",
    );
  });

  it("strips the fragment — it never reaches a server", () => {
    expect(normalizeWebsiteUrl("https://example.com/a#section").url).toBe(
      "https://example.com/a",
    );
  });

  it("strips default ports but keeps non-default ones", () => {
    expect(normalizeWebsiteUrl("https://example.com:443/").url).toBe(
      "https://example.com",
    );
    expect(normalizeWebsiteUrl("https://example.com:8443/").url).toBe(
      "https://example.com:8443",
    );
  });
});

describe("originalUrl", () => {
  it("keeps exactly what the user typed", () => {
    const result = normalizeWebsiteUrl("  HTTP://Example.COM/Path/  ");
    expect(result.originalUrl).toBe("HTTP://Example.COM/Path/");
    expect(result.url).not.toBe(result.originalUrl);
  });
});

describe("duplicate detection", () => {
  it("treats differently-typed forms of the same site as equal", () => {
    expect(isSameMonitoredUrl("example.com", "https://example.com/")).toBe(true);
    expect(isSameMonitoredUrl("http://example.com", "https://example.com")).toBe(true);
  });

  it("returns false rather than throwing on invalid input", () => {
    expect(isSameMonitoredUrl("not a url", "https://example.com")).toBe(false);
  });
});
