import ipaddr from "ipaddr.js";

/**
 * GEO-IP DESTINATION RESOLVER — Module 22 (Phase 15).
 *
 * ⚠️ THIS MODULE NO LONGER FABRICATES A COUNTRY (F-003).
 *
 * The first version matched a handful of hard-coded IP prefixes and TLDs and
 * returned `"US"` for everything that did not match — including every public IP
 * on earth. PDM-R040 then published "Cross-Border Data Transfer to Non-EEA
 * Destination (US)" for essentially any site with a pre-consent third-party
 * request. That is defect #13's exact shape: a rule asserting a fact no
 * instrument recorded, shipped as a customer-visible finding.
 *
 * The honest contract now:
 *
 *   - WITH an injected resolver (a real GeoIP data source — MaxMind GeoLite2
 *     self-hosted is the intended one; a privacy product cannot ship its
 *     users' IPs to a lookup CDN), the resolver's answer is returned as-is.
 *   - WITHOUT one, this returns `null` for every input. `null` is recorded,
 *     and PDM-R040 reads absent as "could not be determined" and emits
 *     nothing. A country we did not resolve is never a country we named.
 *
 * Until a resolver is wired, `PDM-R040` sits in `DORMANT_RULE_IDS`
 * (packages/analysis/src/rules.ts) with its evidence requirement written next
 * to it, and `NetworkRequest.destinationCountry` stays null.
 */

export interface GeoIpOptions {
  /**
   * A real GeoIP lookup. Injected by the caller that owns the data source.
   * Receives an IP address (or, for the hostname fallback path, a hostname)
   * and returns an ISO-3166 alpha-2 code, or null when it cannot determine one.
   */
  resolver?: (ipOrHost: string) => Promise<string | null>;
}

/**
 * Resolves the destination country for an IP address or hostname.
 *
 * Returns `null` — never a guess — when no resolver is configured or when the
 * resolver cannot answer. Private, reserved and non-unicast ranges are null
 * regardless of the resolver: they have no country, and a resolver that
 * answers for them is wrong about the question.
 */
export async function resolveDestinationCountry(
  ipOrHost: string,
  options?: GeoIpOptions,
): Promise<string | null> {
  if (!options?.resolver) return null;

  // Non-unicast ranges have no destination country. Checked here, once, so a
  // resolver cannot be tricked into labelling loopback or link-local traffic.
  if (ipaddr.isValid(ipOrHost)) {
    const parsed = ipaddr.parse(ipOrHost);
    if (parsed.range() !== "unicast") return null;
  }

  try {
    return await options.resolver(ipOrHost);
  } catch {
    return null;
  }
}
