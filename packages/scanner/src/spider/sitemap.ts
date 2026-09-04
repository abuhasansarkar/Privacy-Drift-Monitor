import { assertSafeUrl } from "../net/guard";

/**
 * SITEMAP PARSER & ARCHETYPE SPIDER — Phase 17 task 17.1.
 *
 * Discovers and parses sitemap.xml to extract multi-page scan targets,
 * categorizes discovered URLs into standard archetypes (Home, Cart, Checkout, Form, Blog),
 * and greedily selects the top N diverse representative pages.
 *
 * ⚠️ NEVER TRUST A TARGET URL. Discovered URLs and sub-sitemaps MUST be validated
 * by the SSRF guard before fetching.
 */

import {
  classifyUrlArchetype,
  type UrlArchetype,
} from "./archetypes";

export {
  classifyUrlArchetype,
  ARCHETYPE_PATTERNS,
  type UrlArchetype,
} from "./archetypes";

export interface SitemapDiscoveryResult {
  discoveredUrls: string[];
  selectedUrls: string[];
  archetypes: Record<string, UrlArchetype>;
}

export interface SitemapSpiderOptions {
  maxPages?: number;
  fetchFn?: typeof fetch;
  maxSubSitemaps?: number;
  timeoutMs?: number;
}

/**
 * Extracts <loc> tags from an XML string.
 */
export function extractLocsFromXml(xml: string): string[] {
  const locs: string[] = [];
  const locRegex = /<loc>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const loc = match[1]?.trim();
    if (loc) {
      locs.push(loc);
    }
  }
  return locs;
}

/**
 * Checks if XML content is a sitemap index (<sitemapindex>).
 */
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Selects top diverse archetypal URLs up to maxPages.
 */
export function selectDiverseArchetypalUrls(
  urls: string[],
  baseUrl: string,
  maxPages = 5,
): { selectedUrls: string[]; archetypes: Record<string, UrlArchetype> } {
  const archetypes: Record<string, UrlArchetype> = {};
  const buckets: Record<UrlArchetype, string[]> = {
    HOME: [],
    CART: [],
    CHECKOUT: [],
    FORM: [],
    BLOG: [],
    GENERIC: [],
  };

  const cleanBase = new URL(baseUrl);
  const baseHost = cleanBase.hostname.toLowerCase();

  // Deduplicate and filter to same-host URLs
  const uniqueUrls = Array.from(new Set(urls)).filter((u) => {
    try {
      const parsed = new URL(u);
      return parsed.hostname.toLowerCase() === baseHost;
    } catch {
      return false;
    }
  });

  // Always ensure HOME exists
  const homeUrl = cleanBase.origin + "/";
  if (!uniqueUrls.some((u) => classifyUrlArchetype(u, baseUrl) === "HOME")) {
    uniqueUrls.unshift(homeUrl);
  }

  for (const u of uniqueUrls) {
    const type = classifyUrlArchetype(u, baseUrl);
    archetypes[u] = type;
    buckets[type].push(u);
  }

  const selected: string[] = [];

  // Priority order for multi-page diversity:
  // 1. HOME (crucial root)
  // 2. CART (first-party commerce)
  // 3. CHECKOUT (conversion tracking)
  // 4. FORM (lead capture pixels)
  // 5. BLOG (content syndication / tracking)
  // 6. GENERIC / additional
  const priorityOrder: UrlArchetype[] = ["HOME", "CART", "CHECKOUT", "FORM", "BLOG"];

  // Pick one from each priority archetype first
  for (const type of priorityOrder) {
    const candidate = buckets[type][0];
    if (candidate && !selected.includes(candidate) && selected.length < maxPages) {
      selected.push(candidate);
    }
  }

  // Fill remaining slots greedily from unused candidates
  const remaining = uniqueUrls.filter((u) => !selected.includes(u));
  for (const u of remaining) {
    if (selected.length >= maxPages) break;
    selected.push(u);
  }

  return { selectedUrls: selected, archetypes };
}

/**
 * Discovers and fetches sitemap.xml from the target site, parses URLs,
 * and clusters them into archetypes.
 */
export async function fetchAndParseSitemap(
  targetUrl: string,
  options: SitemapSpiderOptions = {},
): Promise<SitemapDiscoveryResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const maxPages = options.maxPages ?? 5;
  const maxSubSitemaps = options.maxSubSitemaps ?? 3;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const base = new URL(targetUrl);
  const candidatePaths = [
    new URL("/sitemap.xml", base.origin).toString(),
    new URL("/sitemap_index.xml", base.origin).toString(),
  ];

  const discoveredUrls: string[] = [];

  for (const sitemapUrl of candidatePaths) {
    try {
      await assertSafeUrl(sitemapUrl);
    } catch {
      continue;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetchFn(sitemapUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "PrivacyDriftMonitor/1.0 (+https://privacydrift.com)" },
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const xml = await res.text();
      const locs = extractLocsFromXml(xml);

      if (isSitemapIndex(xml)) {
        // Nested sitemap index: fetch up to maxSubSitemaps children
        const subSitemaps = locs.slice(0, maxSubSitemaps);
        for (const subUrl of subSitemaps) {
          try {
            await assertSafeUrl(subUrl);
            const subRes = await fetchFn(subUrl, {
              headers: { "User-Agent": "PrivacyDriftMonitor/1.0 (+https://privacydrift.com)" },
            });
            if (subRes.ok) {
              const subXml = await subRes.text();
              discoveredUrls.push(...extractLocsFromXml(subXml));
            }
          } catch {
            // Tolerate single sub-sitemap failure
          }
        }
      } else {
        discoveredUrls.push(...locs);
      }

      if (discoveredUrls.length > 0) {
        break; // Successfully got sitemap entries
      }
    } catch {
      // Continue to next candidate
    }
  }

  // If no sitemap found or empty, fallback to base URL
  if (discoveredUrls.length === 0) {
    discoveredUrls.push(new URL("/", base.origin).toString());
  }

  const { selectedUrls, archetypes } = selectDiverseArchetypalUrls(
    discoveredUrls,
    targetUrl,
    maxPages,
  );

  return {
    discoveredUrls,
    selectedUrls,
    archetypes,
  };
}
