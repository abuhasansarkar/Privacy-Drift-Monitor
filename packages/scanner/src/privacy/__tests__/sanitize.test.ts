import { describe, expect, it } from "vitest";
import {
  REDACTED,
  diagnosticHeaderNames,
  hashValue,
  redactValue,
  sanitizeConsoleMessage,
  sanitizeCookieValue,
  sanitizeStorageValue,
  sanitizeUrl,
} from "../sanitize";

/**
 * EVIDENCE MINIMISATION — PLAN.md §10.6.
 *
 * Phase 2 acceptance criterion: "evidence contains no cookie values, no storage
 * values and no query strings". These tests are that criterion. Each one is a
 * thing we would otherwise have written into the database about somebody
 * else's visitor.
 */

describe("sanitizeUrl", () => {
  it("removes the query string entirely, not selectively", () => {
    const out = sanitizeUrl("https://x.example/collect?uid=abc123&email=a@b.com");
    expect(out.url).toBe("https://x.example/collect");
    expect(out.url).not.toContain("?");
    expect(out.hadQuery).toBe(true);
  });

  it("records allowlisted tracking params as presence + hash, never value", () => {
    const out = sanitizeUrl("https://x.example/c?utm_source=news&gclid=XYZ&other=1");
    const names = out.params.map((p) => p.name);

    expect(names).toContain("utm_source");
    expect(names).toContain("gclid");
    expect(names).not.toContain("other");

    const serialized = JSON.stringify(out.params);
    expect(serialized).not.toContain("news");
    expect(serialized).not.toContain("XYZ");
  });

  it("never records a sensitive param, not even hashed", () => {
    // Hashing a password is still handling a password.
    const out = sanitizeUrl(
      "https://x.example/c?token=t&session_id=s&email=a@b.com&api_key=k",
    );
    expect(out.params).toEqual([]);
  });

  it("redacts a credential carried in the PATH, which query-stripping misses", () => {
    const out = sanitizeUrl(
      "https://x.example/reset/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    );
    expect(out.url).not.toContain("eyJhbGci");
    expect(out.url).toContain(REDACTED);
    expect(out.redacted).toBe(true);
  });

  it("redacts a long opaque id in a path segment", () => {
    const out = sanitizeUrl("https://x.example/u/9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c");
    expect(out.url).toBe(`https://x.example/u/${REDACTED}`);
  });

  it("leaves ordinary paths alone", () => {
    // Over-redaction hides real drift, so the 20-char floor has to hold.
    const out = sanitizeUrl("https://x.example/en-gb/products/blue-widget");
    expect(out.url).toBe("https://x.example/en-gb/products/blue-widget");
    expect(out.redacted).toBe(false);
  });

  it("drops the fragment and lowercases the host", () => {
    const out = sanitizeUrl("https://X.Example.COM/path#section");
    expect(out.url).toBe("https://x.example.com/path");
  });

  it("strips a default port but keeps a non-default one", () => {
    expect(sanitizeUrl("https://x.example:443/a").url).toBe("https://x.example/a");
    expect(sanitizeUrl("http://x.example:80/a").url).toBe("http://x.example/a");
    expect(sanitizeUrl("https://x.example:8443/a").url).toBe("https://x.example:8443/a");
  });

  it("records an unparseable URL rather than losing the request", () => {
    // A page can genuinely request a malformed URL. Dropping the whole record
    // would lose the fact that the request happened at all.
    const out = sanitizeUrl("not a url at all");
    expect(out.url.length).toBeGreaterThan(0);
    expect(out.redacted).toBe(true);
  });
});

describe("redactValue", () => {
  it("redacts emails, JWTs and token-shaped strings", () => {
    expect(redactValue("contact alice@example.com now")).toBe(
      `contact ${REDACTED} now`,
    );
    expect(redactValue("deadbeefdeadbeefdeadbeef01")).toBe(REDACTED);
  });

  it("matches a JWT as one unit rather than shredding it", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(redactValue(`token=${jwt}`)).toBe(`token=${REDACTED}`);
  });

  it("leaves short human words alone", () => {
    expect(redactValue("consent granted for analytics")).toBe(
      "consent granted for analytics",
    );
  });
});

describe("sanitizeCookieValue", () => {
  it("stores hash and length only for an ordinary cookie", () => {
    const out = sanitizeCookieValue("_ga", "GA1.2.1234567890.1234567890");
    expect(out.valueRaw).toBeNull();
    expect(out.valueHash).toMatch(/^sha256:[a-f0-9]{32}$/);
    expect(out.valueLength).toBe(27);
  });

  it("keeps the raw value for a consent-signal cookie, where it IS the evidence", () => {
    const out = sanitizeCookieValue(
      "CookieConsent",
      "{stamp:'x',necessary:true,marketing:false}",
    );
    expect(out.valueRaw).toContain("marketing:false");
  });

  it("matches a consent-signal prefix pattern", () => {
    expect(sanitizeCookieValue("cmplz_marketing", "deny").valueRaw).toBe("deny");
  });

  it("still sweeps an allowlisted value for an embedded identifier", () => {
    // A CMP that packs a visitor id into its consent string must not smuggle
    // it past us just because the cookie name is allowlisted.
    const out = sanitizeCookieValue(
      "OptanonConsent",
      "groups=C0001:1&user=alice@example.com",
    );
    expect(out.valueRaw).not.toContain("alice@example.com");
    expect(out.valueRaw).toContain(REDACTED);
  });

  it("hashes deterministically so drift can compare across scans", () => {
    expect(sanitizeCookieValue("x", "same").valueHash).toBe(
      sanitizeCookieValue("x", "same").valueHash,
    );
    expect(sanitizeCookieValue("x", "a").valueHash).not.toBe(
      sanitizeCookieValue("x", "b").valueHash,
    );
  });
});

describe("sanitizeStorageValue", () => {
  it("never keeps an ordinary storage value", () => {
    // localStorage is where session tokens live.
    const out = sanitizeStorageValue("authState", '{"accessToken":"abc"}');
    expect(out.valueRaw).toBeNull();
    expect(out.valueLength).toBe(21);
  });

  it("keeps an allowlisted consent-state key", () => {
    expect(sanitizeStorageValue("uc_settings", "denied").valueRaw).toBe("denied");
  });
});

describe("sanitizeConsoleMessage", () => {
  it("truncates to 500 characters", () => {
    expect(sanitizeConsoleMessage("x".repeat(900))).toHaveLength(500);
  });

  it("redacts before truncating", () => {
    const out = sanitizeConsoleMessage("failed for user bob@example.com");
    expect(out).not.toContain("bob@example.com");
  });
});

describe("diagnosticHeaderNames", () => {
  it("returns names only, and only allowlisted ones", () => {
    const names = diagnosticHeaderNames({
      "Content-Type": "text/html",
      Authorization: "Bearer secret",
      "Set-Cookie": "a=b",
      "Cache-Control": "no-store",
    });
    expect(names).toEqual(["cache-control", "content-type"]);
    expect(JSON.stringify(names)).not.toContain("secret");
  });
});

describe("hashValue", () => {
  it("is prefixed and length-capped", () => {
    expect(hashValue("x")).toMatch(/^sha256:[a-f0-9]{32}$/);
  });
});
