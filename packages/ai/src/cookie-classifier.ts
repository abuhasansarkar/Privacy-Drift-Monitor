import {
  CookieClassifyOutputSchema,
  type CookieClassifyOutput,
} from "./prompts/cookie-classify";

/**
 * AI & HEURISTIC COOKIE CLASSIFIER — Phase 17 task 17.4 & 17.5.
 *
 * Classifies unknown browser cookies and storage entries into standard
 * categories: NECESSARY, ANALYTICS, ADVERTISING, FUNCTIONAL.
 *
 * 1. Fast Path: Known well-known cookies (Matomo _pk_id, Google Analytics _ga, Meta _fbp, Cloudflare __cf_bm, etc.)
 * 2. Cache: In-memory/persistent cache keyed by `cookie:${name}:${domain}` to avoid duplicate LLM calls.
 * 3. AI Classifier: Calls COOKIE_CLASSIFY_V1 with structured validation when unclassified.
 */

export interface CookieClassificationInput {
  name: string;
  domain: string;
  durationDays?: number | null;
  path?: string;
  initiatorUrl?: string | null;
}

export interface CookieClassifierDeps {
  classifyFn?: (input: CookieClassificationInput) => Promise<CookieClassifyOutput>;
}

// In-memory cache for cookie classifications
const CLASSIFICATION_CACHE = new Map<string, CookieClassifyOutput>();

/**
 * Fast-path catalog of standard and well-known industry cookies.
 */
const KNOWN_COOKIES: Array<{
  pattern: RegExp;
  output: CookieClassifyOutput;
}> = [
  {
    pattern: /^_pk_(?:id|ses|ref|cvar)/i,
    output: {
      category: "ANALYTICS",
      vendorName: "Matomo",
      purpose: "Matomo analytics cookie tracking site visits and navigation sessions",
      confidence: 0.99,
    },
  },
  {
    pattern: /^_ga(?:_.*)?$|^_gid$|^_gat(?:_.*)?$/i,
    output: {
      category: "ANALYTICS",
      vendorName: "Google Analytics",
      purpose: "Records visitor sessions, unique identifiers, and page metrics",
      confidence: 0.99,
    },
  },
  {
    pattern: /^_fb[pc]$|^fr$|^tr$/i,
    output: {
      category: "ADVERTISING",
      vendorName: "Meta",
      purpose: "Used by Meta/Facebook for conversion tracking, audience attribution, and remarketing",
      confidence: 0.99,
    },
  },
  {
    pattern: /^__cf_bm$|^cf_clearance$/i,
    output: {
      category: "NECESSARY",
      vendorName: "Cloudflare",
      purpose: "Cloudflare bot mitigation and web security verification",
      confidence: 0.99,
    },
  },
  {
    pattern: /^phpsessid$|^jsessionid$|^connect\.sid$|^asp\.net_sessionid$/i,
    output: {
      category: "NECESSARY",
      vendorName: "First Party",
      purpose: "Essential session state maintenance for server-side user authentication",
      confidence: 0.95,
    },
  },
  {
    pattern: /^intercom-(?:id|session)/i,
    output: {
      category: "FUNCTIONAL",
      vendorName: "Intercom",
      purpose: "Customer support messenger session persistence and conversational widget state",
      confidence: 0.95,
    },
  },
  {
    pattern: /^hubspotutk$|^__hstc$|^__hssc$/i,
    output: {
      category: "ANALYTICS",
      vendorName: "HubSpot",
      purpose: "HubSpot visitor tracking and inbound marketing analytics",
      confidence: 0.98,
    },
  },
];

/**
 * Computes a normalized cache key for a cookie.
 */
export function getCookieCacheKey(name: string, domain: string): string {
  const cleanDomain = domain.toLowerCase().replace(/^\./, "");
  return `cookie_class:${name.toLowerCase()}:${cleanDomain}`;
}

/**
 * Clears the classification cache (primarily for test isolation).
 */
export function clearCookieClassificationCache(): void {
  CLASSIFICATION_CACHE.clear();
}

/**
 * Classifies a cookie by checking:
 * 1. Fast-path known patterns
 * 2. Cached classifications
 * 3. AI / Provider classifier function
 * 4. Safe heuristic fallback
 */
export async function classifyCookie(
  input: CookieClassificationInput,
  deps: CookieClassifierDeps = {},
): Promise<CookieClassifyOutput> {
  const name = input.name.trim();
  const domain = input.domain.trim();

  // 1. Fast path: check known patterns
  for (const { pattern, output } of KNOWN_COOKIES) {
    if (pattern.test(name)) {
      return output;
    }
  }

  // 2. Cache check
  const cacheKey = getCookieCacheKey(name, domain);
  const cached = CLASSIFICATION_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 3. AI / custom classifier
  if (deps.classifyFn) {
    try {
      const result = await deps.classifyFn(input);
      const validated = CookieClassifyOutputSchema.parse(result);
      CLASSIFICATION_CACHE.set(cacheKey, validated);
      return validated;
    } catch {
      // Fallback on error
    }
  }

  // 4. Safe heuristic fallback
  const isSession = (input.durationDays ?? 0) <= 0;
  const isFirstParty = !domain.includes("ads") && !domain.includes("track");

  const fallback: CookieClassifyOutput = {
    category: isSession && isFirstParty ? "NECESSARY" : "FUNCTIONAL",
    vendorName: isFirstParty ? "First Party" : "Unknown Provider",
    purpose: "Observed storage item on target website",
    confidence: 0.6,
  };

  CLASSIFICATION_CACHE.set(cacheKey, fallback);
  return fallback;
}
