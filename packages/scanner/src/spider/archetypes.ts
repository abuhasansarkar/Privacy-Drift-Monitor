/**
 * URL ARCHETYPE CLASSIFICATION — Pure client/server shared logic.
 *
 * Clusters URL paths into standard website archetypes:
 * HOME, CART, CHECKOUT, FORM, BLOG, GENERIC.
 *
 * ⚠️ PURE FUNCTIONS ONLY. No Node built-ins (no node:dns, no node:crypto),
 * so this module can be safely imported by client components.
 */

export type UrlArchetype = "HOME" | "CART" | "CHECKOUT" | "FORM" | "BLOG" | "GENERIC";

export const ARCHETYPE_PATTERNS: Array<{ archetype: UrlArchetype; regex: RegExp }> = [
  {
    archetype: "CHECKOUT",
    regex: /(?:[-_/]|^)(?:checkout|order|payment|pay|purchase)(?:[-_/]|$|\?)/i,
  },
  {
    archetype: "CART",
    regex: /(?:[-_/]|^)(?:cart|basket|bag)(?:[-_/]|$|\?)/i,
  },
  {
    archetype: "FORM",
    regex: /(?:[-_/]|^)(?:contact|support|quote|register|signup|inquiry|enquiry|feedback|apply)(?:[-_/]|$|\?)/i,
  },
  {
    archetype: "BLOG",
    regex: /(?:[-_/]|^)(?:blog|news|article|articles|posts|story|stories)(?:[-_/]|$|\?)/i,
  },
];

/**
 * Categorizes a URL into an archetypal bucket based on its path.
 */
export function classifyUrlArchetype(urlStr: string, baseUrlStr: string): UrlArchetype {
  let url: URL;
  let base: URL;
  try {
    url = new URL(urlStr);
    base = new URL(baseUrlStr);
  } catch {
    return "GENERIC";
  }

  const path = url.pathname.toLowerCase();
  if (path === "" || path === "/" || url.href === base.href) {
    return "HOME";
  }

  for (const { archetype, regex } of ARCHETYPE_PATTERNS) {
    if (regex.test(path)) {
      return archetype;
    }
  }

  return "GENERIC";
}
