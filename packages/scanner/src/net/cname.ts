import dns from "node:dns/promises";

/**
 * CNAME CLOAKING RESOLVER — PLAN-V2 Part III, dev-doc2 Module 22.
 *
 * Traverses DNS CNAME chains to detect third-party ad-tech networks
 * masquerading as first-party subdomains (e.g. `metrics.client.com` -> `client.sc.omtrdc.net`).
 */

export interface CnameResolutionResult {
  readonly isCloaked: boolean;
  readonly originalHost: string;
  readonly canonicalHost: string | null;
  readonly chain: readonly string[];
}

const DEFAULT_MAX_HOPS = 5;
const RESOLUTION_CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  readonly chain: readonly string[];
  readonly expiresAt: number;
}

const cnameCache = new Map<string, CacheEntry>();

/** Known cloaking target suffixes used by major ad-tech networks. */
export const KNOWN_CLOAKING_TARGETS: readonly string[] = [
  "omtrdc.net",
  "2o7.net",
  "adroll.com",
  "wt-eu02.net",
  "webtrekk.net",
  "eulerian.net",
  "at-o.net",
  "keywee.co",
  "wizaly.com",
  "affilae.com",
  "criteo.com",
  "sc.omtrdc.net",
  "e.adroll.com",
];

/**
 * Resolves the full CNAME chain for a given host up to `maxHops`.
 * Handles loops and returns all traversed canonical names.
 */
export async function resolveCnameChain(
  host: string,
  maxHops: number = DEFAULT_MAX_HOPS,
): Promise<readonly string[]> {
  const normalized = host.toLowerCase().trim();
  const cached = cnameCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.chain;
  }

  const chain: string[] = [];
  let current = normalized;

  for (let hop = 0; hop < maxHops; hop++) {
    try {
      const records = await dns.resolveCname(current);
      const firstRecord = records?.[0];
      if (!firstRecord) break;

      const target = firstRecord.toLowerCase().trim().replace(/\.$/, "");
      if (chain.includes(target)) {
        // Loop detected
        break;
      }

      chain.push(target);
      current = target;
    } catch {
      // ENODATA, ENOTFOUND, or not a CNAME (e.g. A record)
      break;
    }
  }

  cnameCache.set(normalized, {
    chain,
    expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS,
  });

  return chain;
}

/**
 * Checks whether a host is CNAME cloaked by resolving its CNAME records
 * and checking if any canonical target belongs to a third-party tracking network
 * or exits the first-party registrable domain.
 */
export async function checkCnameCloaking(
  host: string,
  registrableDomain?: string,
  dnsResolver: (h: string) => Promise<readonly string[]> = resolveCnameChain,
): Promise<CnameResolutionResult> {
  const normalizedHost = host.toLowerCase().trim();
  const chain = await dnsResolver(normalizedHost);
  const canonical = chain[chain.length - 1];

  if (!canonical || chain.length === 0) {
    return {
      isCloaked: false,
      originalHost: normalizedHost,
      canonicalHost: null,
      chain: [],
    };
  }

  // 1. Check known cloaking network suffixes
  const matchesKnown = KNOWN_CLOAKING_TARGETS.some((target) =>
    canonical.endsWith(`.${target}`) || canonical === target,
  );

  // 2. Check if canonical domain diverges from the site's registrable domain
  const divergesRegistrableDomain =
    registrableDomain &&
    !canonical.endsWith(`.${registrableDomain.toLowerCase()}`) &&
    canonical !== registrableDomain.toLowerCase();

  const isCloaked = Boolean(matchesKnown || divergesRegistrableDomain);

  return {
    isCloaked,
    originalHost: normalizedHost,
    canonicalHost: canonical,
    chain,
  };
}

export function clearCnameCache(): void {
  cnameCache.clear();
}
