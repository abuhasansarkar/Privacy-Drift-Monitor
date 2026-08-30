import { createHash } from "node:crypto";

/**
 * EVIDENCE MINIMISATION — PLAN.md Part X §10.6. **SECURITY-CRITICAL.**
 *
 * We drive a real browser at our customers' clients' websites and record what
 * happens. That makes us a processor of other people's data, and the single
 * largest liability in the product is storing something we did not need.
 *
 * Every value that reaches the database passes through here first. Nothing
 * downstream may re-introduce a raw value — `EvidenceCollector` is the last
 * point that sees them (Part 0 §0.2 P6).
 *
 * ── The rules, and why each exists ──────────────────────────────────────────
 *
 *  R1  Query strings are removed ENTIRELY. Not filtered — removed. A query
 *      string is where session tokens, email addresses and order ids live, and
 *      an allowlist that has to be right every time is a leak waiting for its
 *      first unusual parameter name.
 *  R2  The PRESENCE of tracking-identifying params is still evidence, so it is
 *      recorded separately as `{ name, valueHash }` — never the value.
 *  R3  Token-shaped strings are redacted ANYWHERE in a URL, including the path.
 *      `/reset/eyJhbGciOi…` carries a credential in a path segment, and R1
 *      would not have touched it.
 *  R4  Cookie and storage values are a hash plus a length. The length alone
 *      distinguishes "the cookie changed" from "the cookie is the same", which
 *      is all the drift engine needs.
 *  R5  A short allowlist of CONSENT-SIGNAL cookies keeps its raw value, because
 *      there the value *is* the diagnostic — it encodes which categories the
 *      visitor consented to. Those are still swept for embedded identifiers.
 */

/** SHA-256, hex, truncated. Full length is unnecessary and invites reversal games. */
export function hashValue(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * Cookies whose VALUE is the consent state itself (§4.5).
 *
 * Matched case-insensitively; a trailing `*` matches a prefix. Keep this list
 * short and justified — every entry is a value we chose to store.
 */
const CONSENT_SIGNAL_COOKIES: readonly string[] = [
  "CookieConsent",
  "cookieyes-consent",
  "OptanonConsent",
  "OptanonAlertBoxClosed",
  "cmplz_*",
  "usercentrics",
  "euconsent-v2",
  "borlabs-cookie",
];

/** Consent-state storage keys, same reasoning as the cookie allowlist. */
const CONSENT_SIGNAL_STORAGE_KEYS: readonly string[] = [
  "cookieyes-consent",
  "cmplz_*",
  "uc_settings",
  "uc_user_interaction",
  "CookieConsent",
];

/** Query params whose presence is a tracking signal worth recording (R2). */
const TRACKING_PARAM_ALLOWLIST: readonly string[] = [
  "utm_*",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "_ga",
  "id",
  "t",
  "ev",
  "cid",
  "tid",
];

/**
 * Parameter names that must never have their value recorded even as a presence
 * signal — the name alone tells us enough, and hashing a password is still
 * handling a password.
 */
const SENSITIVE_PARAM_NAMES =
  /(^|[_-])(token|key|secret|password|passwd|pwd|auth|authorization|session|sid|jwt|bearer|email|mail|phone|tel|ssn|api[_-]?key|access[_-]?token|refresh[_-]?token)([_-]|$)/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** `header.payload.signature`, base64url. The most common credential in a URL. */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/**
 * Token-shaped: 20+ chars of continuous hex or base64url.
 *
 * 20 is deliberate. Below it, ordinary path slugs and cache-busting hashes
 * start matching and the redaction becomes noise that hides real drift; at 20+
 * a string is far more likely to be an identifier than a word.
 */
const TOKEN_SHAPED = /\b(?:[A-Fa-f0-9]{20,}|[A-Za-z0-9_-]{24,})\b/g;

export const REDACTED = "[REDACTED]";

function matchesPattern(name: string, patterns: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => {
    const pattern = p.toLowerCase();
    return pattern.endsWith("*")
      ? lower.startsWith(pattern.slice(0, -1))
      : lower === pattern;
  });
}

/**
 * Redacts credential-shaped substrings from free text (R3).
 *
 * Order matters: JWTs and emails are matched BEFORE the generic token rule,
 * because the generic rule would otherwise eat a JWT's first segment and leave
 * the rest looking like ordinary text.
 */
export function redactValue(text: string): string {
  return text.replace(JWT, REDACTED).replace(EMAIL, REDACTED).replace(TOKEN_SHAPED, REDACTED);
}

export interface QueryParamSignal {
  name: string;
  /** Hash only. Present so drift can see "the value changed" (R2). */
  valueHash: string;
}

export interface SanitizedUrl {
  /** What goes into `NetworkRequest.url`. No query, no fragment, no tokens. */
  url: string;
  /** Allowlisted tracking params that were present, with hashed values. */
  params: QueryParamSignal[];
  /** True when the original carried a query string at all. */
  hadQuery: boolean;
  /** True when something in the path or host was redacted. */
  redacted: boolean;
}

/**
 * The single sanitiser every recorded URL passes through.
 *
 * Unparseable input is not an error — a page can genuinely request a malformed
 * URL, and losing the whole request record because of it would be worse than
 * recording a truncated marker.
 */
export function sanitizeUrl(raw: string): SanitizedUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      url: redactValue(raw).slice(0, 2048),
      params: [],
      hadQuery: false,
      redacted: true,
    };
  }

  const hadQuery = parsed.search.length > 1;

  const params: QueryParamSignal[] = [];
  for (const [name, value] of parsed.searchParams) {
    if (SENSITIVE_PARAM_NAMES.test(name)) continue; // never recorded, not even hashed
    if (!matchesPattern(name, TRACKING_PARAM_ALLOWLIST)) continue;
    params.push({ name: name.toLowerCase(), valueHash: hashValue(value) });
  }

  // R1: the whole query goes, allowlist or not. R3: the path is swept too.
  const redactedPath = redactValue(parsed.pathname);
  const redacted = redactedPath !== parsed.pathname;

  const port =
    (parsed.port === "80" && parsed.protocol === "http:") ||
    (parsed.port === "443" && parsed.protocol === "https:")
      ? ""
      : parsed.port;

  const url =
    `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port ? `:${port}` : ""}${redactedPath}`.slice(
      0,
      2048,
    );

  return { url, params, hadQuery, redacted };
}

export interface SanitizedValue {
  valueHash: string | null;
  valueLength: number;
  /** Populated ONLY for allowlisted consent-signal entries. */
  valueRaw: string | null;
}

/**
 * Cookie values (R4/R5).
 *
 * The default is hash + length. The consent-signal allowlist is the exception,
 * and even there the raw value is swept for embedded identifiers — a CMP that
 * packs a visitor id into its consent string must not smuggle it past us.
 */
export function sanitizeCookieValue(name: string, value: string): SanitizedValue {
  const base: SanitizedValue = {
    valueHash: hashValue(value),
    valueLength: value.length,
    valueRaw: null,
  };

  if (!matchesPattern(name, CONSENT_SIGNAL_COOKIES)) return base;

  return {
    ...base,
    // Capped: a consent string is short. Anything long is not a consent string.
    valueRaw: redactValue(value).slice(0, 512),
  };
}

/** Storage values — same contract as cookies, different allowlist (§4.5). */
export function sanitizeStorageValue(key: string, value: string): SanitizedValue {
  const base: SanitizedValue = {
    valueHash: hashValue(value),
    valueLength: value.length,
    valueRaw: null,
  };

  if (!matchesPattern(key, CONSENT_SIGNAL_STORAGE_KEYS)) return base;

  return { ...base, valueRaw: redactValue(value).slice(0, 512) };
}

/**
 * Console messages (§10.6: "truncated to 500 chars, scanned for token-shaped
 * strings and redacted").
 *
 * These matter — "the CMP script threw before initializing" is what makes a
 * PARTIAL scan explainable — but a page is free to log anything, including a
 * whole auth response.
 */
export function sanitizeConsoleMessage(message: string): string {
  return redactValue(message).slice(0, 500);
}

/**
 * Response header names we keep for diagnostics. **Names only, never values**
 * (§10.6). `Set-Cookie` is counted, not read.
 */
export const DIAGNOSTIC_HEADER_NAMES: readonly string[] = [
  "content-type",
  "content-length",
  "cache-control",
  "location",
  "strict-transport-security",
  "content-security-policy",
];

export function diagnosticHeaderNames(
  headers: Record<string, string>,
): string[] {
  return Object.keys(headers)
    .map((h) => h.toLowerCase())
    .filter((h) => DIAGNOSTIC_HEADER_NAMES.includes(h))
    .sort();
}
