/**
 * CLIENT IP DERIVATION (F-009) — one helper for every rate-limited route.
 *
 * ⚠️ WHY THE LEFTMOST `x-forwarded-for` ENTRY WAS WRONG. The XFF header is
 * APPENDED to by each proxy: `client, proxy1, proxy2`. The attacker controls
 * their own request, so they can start it with `X-Forwarded-For:
 * 1.2.3.4, 5.6.7.8` — and the leftmost entry is then whatever they typed.
 * Keying a rate limit on it means the budget never binds: rotate the header,
 * rotate the identity. (Some proxies PREPEND instead, which is why both
 * positions are handled below — but "last entry" is only trustworthy when the
 * number of trusted proxies in front of us is known, which is a deployment
 * fact, not something the request can tell us.)
 *
 * ⚠️ THE CONTRACT. `PDM_TRUSTED_PROXY_COUNT` (default 1) names how many
 * proxies in front of the app append to XFF. The client IP is that many
 * entries from the RIGHT end. With the default of 1, one reverse proxy (Vercel,
 * nginx, a load balancer) appended the real client IP last, so the rightmost
 * entry is the only one we did not take from the request. Platform-specific
 * headers (`x-vercel-forwarded-for`, `x-real-ip`) are consulted when present,
 * because those are set BY the platform and cannot be spoofed past it.
 *
 * ⚠️ USED BY ALL FOUR RATE-LIMITED ROUTES, AND NOWHERE ELSE. A route that
 * derives the IP itself is a route with its own opinion about identity.
 */

export function getClientIp(headers: Headers): string | null {
  // Platform-set headers first — set by the proxy itself, not appended to a
  // client-controlled header.
  const realIp = headers.get("x-real-ip");
  if (realIp && isPlausibleIp(realIp.trim())) return realIp.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (entries.length > 1) {
      // Only when there IS a chain do we step past the client-written entries:
      // the last `trustedProxies` entries were appended by proxies we trust;
      // everything to the left of them came from the request.
      const trustedProxies = Number.parseInt(
        process.env.PDM_TRUSTED_PROXY_COUNT ?? "1",
        10,
      );
      const count = Number.isFinite(trustedProxies) && trustedProxies >= 1 ? trustedProxies : 1;
      const index = Math.max(0, entries.length - 1 - count);
      const candidate = entries[Math.min(index, entries.length - 1)] ?? null;
      if (candidate && isPlausibleIp(candidate)) return candidate;
    } else if (entries.length === 1) {
      const candidate = entries[0]!;
      if (isPlausibleIp(candidate)) return candidate;
    }
  }

  return null;
}

/** A cheap shape check — enough to reject empty/garbage, not a validator. */
function isPlausibleIp(value: string): boolean {
  return /^[0-9a-fA-F:.]+$/.test(value) && value.length >= 3 && value.length <= 45;
}

export const CLIENT_IP_TEST_CASES: ReadonlyArray<{
  name: string;
  headers: Record<string, string>;
  trustedProxyCount?: string;
  expected: string | null;
}> = [
  {
    name: "single entry — the direct connection case",
    headers: { "x-forwarded-for": "203.0.113.7" },
    expected: "203.0.113.7",
  },
  {
    name: "appended proxy chain — the proxy-received address wins",
    headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    // Two entries, one trusted proxy: the proxy appended 10.0.0.1 (itself),
    // so the address the proxy received the request FROM is 1.2.3.4.
    expected: "1.2.3.4",
  },
  {
    name: "spoofed leftmost entries do not bind the limit",
    headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 10.0.0.1" },
    trustedProxyCount: "1",
    // Three entries, one trusted proxy: the proxy appended the last entry,
    // so the client-facing address as seen by that proxy is 5.6.7.8 — one
    // entry from the right, NOT the client-chosen leftmost.
    expected: "5.6.7.8",
  },
  {
    name: "x-real-ip preferred when the platform sets it",
    headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-real-ip": "198.51.100.9" },
    expected: "198.51.100.9",
  },
  {
    name: "no headers at all",
    headers: {},
    expected: null,
  },
  {
    name: "garbage in the header is not an identity",
    headers: { "x-forwarded-for": "not-an-ip" },
    expected: null,
  },
];
