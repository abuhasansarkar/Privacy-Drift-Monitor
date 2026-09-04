import type { Page } from "playwright";
import { assertSafeUrl, type AssertSafeUrlOptions } from "../net/guard";

/**
 * POLICY LINK DISCOVERY — Module 23 (Phase 14).
 *
 * Spiders DOM anchor links and footer areas to detect the target website's
 * published Privacy Policy or Cookie Policy URL.
 *
 * ⚠️ NEVER TRUST A TARGET URL. Discovered URLs must be checked against the SSRF
 * guard before navigation or fetching.
 */

export const POLICY_LINK_TEXT_REGEX =
  /\b(?:privacy\s+policy|privacy\s+notice|cookie\s+policy|data\s+protection|data\s+privacy|privacy)\b/i;

export const POLICY_HREF_REGEX =
  /(?:\/|#)(?:privacy(?:-policy|_policy)?|cookie-policy|data-protection|data-privacy|legal\/privacy)\b/i;

export const COMMON_POLICY_PATHS = [
  "/privacy-policy",
  "/privacy",
  "/privacy-notice",
  "/cookie-policy",
  "/legal/privacy",
] as const;

export interface DiscoveredLink {
  href: string;
  text: string;
}

/**
 * Extracts links matching privacy policy keywords from HTML text.
 */
export function extractPolicyLinksFromHtml(
  html: string,
  baseUrl: string,
): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  const anchorRegex = /<a\s+[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1]?.trim() ?? "";
    const rawText = match[2]?.replace(/<[^>]+>/g, "").trim() ?? "";

    if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) {
      continue;
    }

    if (POLICY_LINK_TEXT_REGEX.test(rawText) || POLICY_HREF_REGEX.test(rawHref)) {
      try {
        const resolved = new URL(rawHref, baseUrl).toString();
        links.push({ href: resolved, text: rawText });
      } catch {
        // Ignore unparseable relative URLs
      }
    }
  }

  return links;
}

/**
 * Finds the most probable privacy policy URL from a set of links or HTML.
 */
export function selectBestPolicyLink(
  links: DiscoveredLink[],
  baseUrl: string,
): string | null {
  if (links.length === 0) return null;

  // Rank matches: exact "privacy policy" in text + href > text only > href only
  const baseHostname = (() => {
    try {
      return new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const scored = links.map((link) => {
    let score = 0;
    const lowerText = link.text.toLowerCase();
    const lowerHref = link.href.toLowerCase();

    // Prefer same domain or subdomain
    try {
      const linkHost = new URL(link.href).hostname.toLowerCase();
      if (linkHost === baseHostname || linkHost.endsWith(`.${baseHostname}`)) {
        score += 10;
      }
    } catch {
      // Ignore
    }

    if (/\bprivacy\s+policy\b/i.test(lowerText)) score += 20;
    else if (POLICY_LINK_TEXT_REGEX.test(lowerText)) score += 10;

    if (lowerHref.includes("privacy-policy")) score += 15;
    else if (lowerHref.includes("privacy")) score += 8;
    else if (lowerHref.includes("cookie-policy")) score += 5;

    return { link, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.link.href ?? null;
}

/**
 * Discovers privacy policy link from a loaded Playwright page.
 */
export async function discoverPolicyFromPage(
  page: Page,
  baseUrl: string,
): Promise<string | null> {
  try {
    const links = (await page.evaluate(`
      (() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        return anchors.map((a) => ({
          href: a.getAttribute("href") || "",
          text: (a.textContent || "").trim(),
        }));
      })()
    `)) as Array<{ href: string; text: string }>;

    const parsedLinks: DiscoveredLink[] = [];
    for (const item of links) {
      if (!item.href || item.href.startsWith("javascript:") || item.href.startsWith("mailto:")) {
        continue;
      }
      if (POLICY_LINK_TEXT_REGEX.test(item.text) || POLICY_HREF_REGEX.test(item.href)) {
        try {
          const resolved = new URL(item.href, baseUrl).toString();
          parsedLinks.push({ href: resolved, text: item.text });
        } catch {
          // Ignore unparseable
        }
      }
    }

    const best = selectBestPolicyLink(parsedLinks, baseUrl);
    if (best) return best;
  } catch {
    // If page evaluation fails, fallback to standard paths
  }

  return null;
}

/**
 * Resolves a safe policy URL, checking SSRF guard.
 */
export async function resolveSafePolicyUrl(
  candidateUrl: string,
  options?: AssertSafeUrlOptions,
): Promise<string | null> {
  try {
    const pinned = await assertSafeUrl(candidateUrl, options);
    return pinned.url;
  } catch {
    return null;
  }
}
