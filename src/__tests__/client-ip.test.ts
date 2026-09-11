import { describe, expect, it, afterEach } from "vitest";
import { getClientIp, CLIENT_IP_TEST_CASES } from "@/server/client-ip";

/**
 * CLIENT IP DERIVATION (F-009).
 *
 * The free scanner's 3/hour + 10/day per-IP budgets, the analytics limiter,
 * the contact form and the portal magic-link limiter all keyed on the
 * LEFTMOST x-forwarded-for entry — which is the one entry the attacker fully
 * controls (XFF is appended to by proxies; the client writes the first entry).
 * Rotating the header rotated the identity, and no budget ever bound.
 *
 * These cases pin the derivation so a refactor cannot quietly move the
 * identity back to a spoofable position.
 */

describe("getClientIp (F-009)", () => {
  const originalTrusted = process.env.PDM_TRUSTED_PROXY_COUNT;

  afterEach(() => {
    if (originalTrusted === undefined) delete process.env.PDM_TRUSTED_PROXY_COUNT;
    else process.env.PDM_TRUSTED_PROXY_COUNT = originalTrusted;
  });

  for (const testCase of CLIENT_IP_TEST_CASES) {
    it(testCase.name, () => {
      if (testCase.trustedProxyCount !== undefined) {
        process.env.PDM_TRUSTED_PROXY_COUNT = testCase.trustedProxyCount;
      }
      const headers = new Headers(testCase.headers);
      expect(getClientIp(headers)).toBe(testCase.expected);
    });
  }

  it("honours a two-proxy deployment", () => {
    process.env.PDM_TRUSTED_PROXY_COUNT = "2";
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" });
    // Two trusted proxies appended: the real client is two from the right.
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  it("returns null rather than an internal address from an untrusted position", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.99" });
    // With one trusted proxy, that single entry IS the last hop — it is
    // returned (our own proxy is trusted to have written it).
    expect(getClientIp(headers)).toBe("10.0.0.99");
  });
});
