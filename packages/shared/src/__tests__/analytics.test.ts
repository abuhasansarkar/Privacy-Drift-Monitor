import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENTS,
  AnalyticsPropertyError,
  assertSafeProperties,
  domainHash,
  setAnalyticsTransport,
  track,
} from "../analytics";

/**
 * ANALYTICS — PLAN.md §9.6, Phase 6 task 6.8.
 *
 * ⚠️ THE ASSERTIONS HERE ARE ABOUT OUR OWN PRIVACY, not about telemetry
 * working. §9.6: "we never send scanned website URLs, client names, cookie
 * values, or evidence content... **Our own product must meet the standard we
 * sell.**" A privacy-monitoring product whose funnel quietly accumulates every
 * URL its customers monitor has no standing to report on anyone.
 */

afterEach(() => {
  setAnalyticsTransport(null);
  vi.unstubAllEnvs();
});

describe("assertSafeProperties", () => {
  it("passes ordinary properties through", () => {
    expect(assertSafeProperties({ plan: "growth", count: 3, ok: true })).toEqual({
      plan: "growth",
      count: 3,
      ok: true,
    });
  });

  it.each([
    "url",
    "website_url",
    "domain",
    "hostname",
    "clientName",
    "email",
    "cookie_value",
    "evidence",
  ])("⚠️ REFUSES the forbidden key %s in development", (key) => {
    expect(() => assertSafeProperties({ [key]: "anything" })).toThrow(
      AnalyticsPropertyError,
    );
  });

  it("⚠️ DROPS rather than throws in production", () => {
    /*
     * The two behaviours serve different people: a developer adding
     * `domain: website.url` finds out immediately, and a customer never has a
     * page fail because of a telemetry mistake that shipped anyway.
     */
    vi.stubEnv("NODE_ENV", "production");
    expect(assertSafeProperties({ domain: "example.com", plan: "growth" })).toEqual({
      plan: "growth",
    });
  });
});

describe("domainHash", () => {
  it("is stable for the same domain and case-insensitive", () => {
    expect(domainHash("Example.COM")).toBe(domainHash("example.com"));
  });

  it("differs between domains and never contains the input", () => {
    const hash = domainHash("example.com");
    expect(hash).not.toBe(domainHash("other.com"));
    expect(hash).not.toContain("example");
  });

  it("⚠️ IS SALTED, so the small public space of domains is not a lookup table", () => {
    vi.stubEnv("ANALYTICS_SALT", "salt-one");
    const first = domainHash("example.com");
    vi.stubEnv("ANALYTICS_SALT", "salt-two");
    expect(domainHash("example.com")).not.toBe(first);
  });
});

describe("track", () => {
  it("sends through the injected transport", async () => {
    const send = vi.fn(async () => undefined);
    setAnalyticsTransport({ send });

    await track("website_added", { source: "manual" }, { agencyId: "a1" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "website_added",
        properties: { source: "manual" },
        context: { agencyId: "a1" },
      }),
    );
  });

  it("⚠️ NEVER THROWS WHEN THE TRANSPORT FAILS", async () => {
    // An analytics outage must not fail a scan, a checkout or a page render.
    setAnalyticsTransport({
      send: async () => {
        throw new Error("collector down");
      },
    });
    await expect(track("scan_completed", { status: "COMPLETED" })).resolves.toBeUndefined();
  });

  it("still enforces the property rule with a transport attached", async () => {
    const send = vi.fn(async () => undefined);
    setAnalyticsTransport({ send });

    await expect(track("website_added", { url: "https://example.com" })).rejects.toThrow(
      AnalyticsPropertyError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("no transport is a no-op, not a failure", async () => {
    await expect(track("page_viewed", { path: "/pricing" })).resolves.toBeUndefined();
  });
});

describe("the event inventory", () => {
  it("covers §9.6's funnel end to end", () => {
    // §9.7 defines activation over these five. A rename here silently breaks a
    // funnel that nobody looks at until the quarter ends.
    for (const event of [
      "signup_completed",
      "agency_created",
      "website_added",
      "scan_completed",
      "entitlement_limit_hit",
    ] as const) {
      expect(ANALYTICS_EVENTS).toContain(event);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
  });
});
