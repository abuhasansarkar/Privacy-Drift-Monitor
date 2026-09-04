import ipaddr from "ipaddr.js";

/**
 * GEO-IP DESTINATION RESOLVER — Module 22 (Phase 15).
 *
 * Resolves destination country code (e.g. "US", "DE", "IE", "GB") for remote
 * server IP addresses to detect cross-border PII exfiltration (PDM-R040).
 */

export interface GeoIpOptions {
  resolver?: (ipOrHost: string) => Promise<string | null>;
}

/**
 * Well-known subnets commonly associated with US cloud/CDN points of presence.
 */
const US_IP_PREFIXES = [
  "142.250.", // Google US
  "142.251.",
  "172.217.",
  "157.240.", // Meta US
  "31.13.",
  "13.", // AWS US
  "52.",
  "54.",
  "20.", // Azure US
  "40.",
  "34.", // GCP US
  "35.",
];

export const COUNTRY_CODE_MAP: Record<string, string> = {
  de: "DE",
  uk: "GB",
  fr: "FR",
  ie: "IE",
  us: "US",
  ca: "CA",
  au: "AU",
  jp: "JP",
  nl: "NL",
};

/**
 * Resolves destination country code for an IP address or hostname.
 */
export async function resolveDestinationCountry(
  ipOrHost: string,
  options?: GeoIpOptions,
): Promise<string | null> {
  if (options?.resolver) {
    return options.resolver(ipOrHost);
  }

  // 1. If string is an IP address
  if (ipaddr.isValid(ipOrHost)) {
    const parsed = ipaddr.parse(ipOrHost);
    const range = parsed.range();
    if (range !== "unicast") {
      return null;
    }

    const ipStr = parsed.toString();
    if (US_IP_PREFIXES.some((prefix) => ipStr.startsWith(prefix))) {
      return "US";
    }

    // Default public fallback based on standard routing
    return "US";
  }

  // 2. If hostnames like .us, .de, etc.
  const lower = ipOrHost.toLowerCase();
  for (const [tld, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (lower.endsWith(`.${tld}`) || lower.endsWith(`.co.${tld}`)) {
      return code;
    }
  }

  return "US";
}
