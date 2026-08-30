import { parse } from "tldts";

/**
 * URL NORMALIZATION — PLAN.md Part III §3.6.
 *
 * Turns whatever a user typed into the canonical form we store and monitor.
 *
 * ⚠️ This module makes NO network calls and performs NO safety checks. Passing
 * it is not permission to fetch anything — `assertSafeUrl()` in
 * packages/scanner/src/net/guard.ts is the security boundary, and it must run
 * on every navigation AND every redirect hop (§10.3).
 */

export interface NormalizedUrl {
  /** Canonical form we store and scan. */
  url: string;
  /** Exactly what the user typed, before any transformation. */
  originalUrl: string;
  /** Lowercased host, `www` PRESERVED. */
  host: string;
  /** eTLD+1 via the Public Suffix List. Indexed separately — drift and third-party classification both need it. */
  registrableDomain: string;
  /** Always `https:` — see `upgradedToHttps`. */
  protocol: "https:";
  /** Exactly what the user typed, before the probe upgrade. */
  originalProtocol: "http:" | "https:";
  /**
   * True when we upgraded a typed `http://` to `https://` for probing.
   *
   * The caller owns the downgrade: if only HTTP answers, store the http form
   * and raise PDM-R022 (insecure transport, Medium). Without this flag the
   * caller cannot tell an upgrade apart from a user who typed https.
   */
  upgradedToHttps: boolean;
  /** True when the user supplied a path beyond `/`, which we preserve. */
  hasExplicitPath: boolean;
}

export class UrlNormalizationError extends Error {
  constructor(
    readonly userMessage: string,
    reason: string,
  ) {
    super(reason);
    this.name = "UrlNormalizationError";
  }
}

/**
 * Rules, all from §3.6:
 *
 *  - lowercase scheme and host
 *  - strip default ports (:80 on http, :443 on https)
 *  - strip the fragment — never sent to a server, never affects behaviour
 *  - strip a trailing slash ONLY on the root path
 *  - PRESERVE a user-supplied path (some clients monitor a landing page)
 *  - upgrade `http://` → `https://` for probing; the caller downgrades and
 *    raises PDM-R022 (insecure transport, Medium) if only HTTP answers
 *  - DO NOT strip `www` — `www.x.com` and `x.com` can behave differently, and
 *    treating them as one site would merge two different tracking profiles
 */
export function normalizeWebsiteUrl(input: string): NormalizedUrl {
  const originalUrl = input.trim();

  if (originalUrl.length === 0) {
    throw new UrlNormalizationError(
      "That doesn't look like a valid website address.",
      "EMPTY_INPUT",
    );
  }

  // Bare "example.com" is the common case — assume https rather than rejecting.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(originalUrl)
    ? originalUrl
    : `https://${originalUrl}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new UrlNormalizationError(
      "That doesn't look like a valid website address.",
      "UNPARSEABLE",
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new UrlNormalizationError(
      "We can only monitor http and https addresses.",
      `BAD_SCHEME:${protocol}`,
    );
  }

  // Embedded credentials are a classic guard-bypass shape
  // (`http://trusted.com@127.0.0.1/`). Refuse rather than strip.
  if (parsed.username || parsed.password) {
    throw new UrlNormalizationError(
      "We can't monitor an address that contains a username or password.",
      "URL_HAS_CREDENTIALS",
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    throw new UrlNormalizationError(
      "That doesn't look like a valid website address.",
      "NO_HOST",
    );
  }

  const originalProtocol = protocol as "http:" | "https:";
  const upgradedToHttps = originalProtocol === "http:";
  const finalProtocol = "https:" as const;

  // `tldts` carries the Public Suffix List, so co.uk / com.au resolve correctly
  // rather than naively taking the last two labels.
  const { domain } = parse(host, { allowPrivateDomains: false });
  if (!domain) {
    // Covers bare IPs and unlisted TLDs. The SSRF guard rejects IP literals too,
    // but failing here gives the user a far better message.
    throw new UrlNormalizationError(
      "We couldn't recognise that as a website address. Enter a domain, e.g. example.com.",
      `NO_REGISTRABLE_DOMAIN:${host}`,
    );
  }

  /**
   * Strip the port only when it is the default for the scheme the USER typed.
   * `http://x.com:80` and `https://x.com:443` both mean "the default port", so
   * both normalize to `https://x.com`.
   *
   * A non-default port survives the upgrade — `http://x.com:8080` becomes
   * `https://x.com:8080`, i.e. we probe TLS on the port they named. That is
   * intentional: the alternative, silently rewriting the port, would monitor a
   * different service than the one requested. When TLS does not answer there,
   * the caller downgrades using `upgradedToHttps`.
   */
  const isDefaultPort =
    (parsed.port === "80" && originalProtocol === "http:") ||
    (parsed.port === "443" && originalProtocol === "https:");
  const port = isDefaultPort ? "" : parsed.port;

  const hasExplicitPath = parsed.pathname !== "/" && parsed.pathname !== "";
  const path = hasExplicitPath ? parsed.pathname.replace(/\/+$/, "") : "";

  const url =
    `${finalProtocol}//${host}${port ? `:${port}` : ""}${path}${parsed.search}`;

  return {
    url,
    originalUrl,
    host,
    registrableDomain: domain,
    protocol: finalProtocol,
    originalProtocol,
    upgradedToHttps,
    hasExplicitPath,
  };
}

/**
 * Two URLs are "the same monitored site" when host, port and path match after
 * normalization. Used to block adding a duplicate (§3.6).
 *
 * Scheme is deliberately NOT part of the comparison, because normalization
 * upgrades everything to `https:` — so `http://x.com` and `https://x.com` are
 * one site. `www.x.com` and `x.com` remain two, because `www` is preserved.
 */
export function isSameMonitoredUrl(a: string, b: string): boolean {
  try {
    return normalizeWebsiteUrl(a).url === normalizeWebsiteUrl(b).url;
  } catch {
    return false;
  }
}
