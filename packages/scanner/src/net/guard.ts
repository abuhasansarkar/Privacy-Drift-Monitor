import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

/**
 * SSRF GUARD — PLAN.md Part X §10.3. **SECURITY-CRITICAL.**
 *
 * This module stands between a user-supplied string and a browser that will
 * fetch it. On the free public scanner (§3.2) that string comes from an
 * ANONYMOUS user, so without this the product is hosted SSRF-as-a-service.
 *
 * Risk register: Low probability, **CRITICAL impact**.
 *
 * ── Defence in depth ────────────────────────────────────────────────────────
 * This is LAYER ONE of three. Never treat it as sufficient on its own:
 *   1. this module
 *   2. an infrastructure egress firewall on the scanner workers
 *   3. NO metadata credentials on scanner workers at all
 * The register's fallback is explicit: "egress firewall holds even if the app
 * guard has a bug."
 *
 * ── Rules that are load-bearing ─────────────────────────────────────────────
 *   R1  http/https only.
 *   R1b Port allowlist: 80, 443, 8080, 8443 (§10.3). A public IP on port 22,
 *       6379 or 5432 is still an internal service to somebody — the address
 *       checks alone do not make an arbitrary port safe to reach.
 *   R2  No embedded credentials — `http://trusted.com@127.0.0.1/`.
 *   R3  Resolve ALL A/AAAA records and reject if ANY is unsafe. A host that
 *       returns one public and one private address is a rebinding attack.
 *   R4  PIN the resolved IP and connect to that address. Resolving once to
 *       check and again to connect is a DNS-rebinding race (TOCTOU).
 *   R5  Re-run the WHOLE guard on EVERY redirect hop. A 302 to
 *       http://169.254.169.254/ is the single most common bypass.
 *   R6  Cap redirect depth.
 *   R7  The user-facing message is deliberately vague — "We can't monitor this
 *       address." Never reveal which check failed; that is a probe oracle. The
 *       real reason goes to the security log.
 */

export type SsrfRejectionReason =
  | "BAD_SCHEME"
  | "BAD_PORT"
  | "URL_HAS_CREDENTIALS"
  | "UNPARSEABLE"
  | "DNS_FAILURE"
  | "NO_ADDRESSES"
  | "PRIVATE_ADDRESS"
  | "LOOPBACK_ADDRESS"
  | "LINK_LOCAL_ADDRESS"
  | "CLOUD_METADATA_ADDRESS"
  | "UNIQUE_LOCAL_ADDRESS"
  | "MULTICAST_ADDRESS"
  | "RESERVED_ADDRESS"
  | "BLOCKLISTED_DOMAIN"
  | "REDIRECT_LIMIT";

/** The message shown to users for EVERY rejection. Deliberately uninformative (R7). */
export const SSRF_USER_MESSAGE = "We can't monitor this address.";

export class SsrfBlockedError extends Error {
  readonly code = "URL_NOT_ALLOWED" as const;
  readonly userMessage = SSRF_USER_MESSAGE;

  constructor(
    readonly reason: SsrfRejectionReason,
    /** Logged as a security event. NEVER returned to the caller. */
    readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
    this.name = "SsrfBlockedError";
  }
}

export interface PinnedTarget {
  /** The validated URL. */
  url: string;
  hostname: string;
  /**
   * The address that was validated. The caller MUST connect to this exact IP
   * rather than re-resolving the hostname (R4).
   */
  pinnedAddress: string;
  family: 4 | 6;
  /** Every address that resolved. All were validated; all are safe. */
  allAddresses: string[];
}

export const MAX_REDIRECT_HOPS = 3;

/**
 * The only ports we will connect to (§10.3).
 *
 * 8080/8443 are allowed because staging sites legitimately use them, and
 * refusing those would break a real agency workflow. Everything else is
 * refused: reaching a public host on 22, 3306, 5432 or 6379 is not "browsing a
 * website", and the address-range checks say nothing about which service is
 * listening on a given port.
 */
const ALLOWED_PORTS: ReadonlySet<string> = new Set(["80", "443", "8080", "8443"]);

/**
 * IPv4 ranges that must never be reachable.
 * `ipaddr.js` labels most of these; the metadata check is ours because
 * 169.254.169.254 is merely "linkLocal" to the library but is the single most
 * valuable SSRF target in a cloud environment.
 */
const CLOUD_METADATA_V4 = new Set([
  "169.254.169.254", // AWS / GCP / Azure / DigitalOcean
  "169.254.170.2", // AWS ECS task metadata
  "100.100.100.200", // Alibaba Cloud
]);

const CLOUD_METADATA_V6 = new Set([
  "fd00:ec2::254", // AWS IMDSv6
]);

/**
 * `ipaddr.js` range names that are never safe to reach.
 * `unicast` is the only accepted value; everything else is refused by default,
 * so a future range added by the library fails CLOSED rather than open.
 */
const BLOCKED_RANGES: Record<string, SsrfRejectionReason> = {
  unspecified: "RESERVED_ADDRESS", // 0.0.0.0, ::
  broadcast: "RESERVED_ADDRESS", // 255.255.255.255
  linkLocal: "LINK_LOCAL_ADDRESS", // 169.254.0.0/16, fe80::/10
  loopback: "LOOPBACK_ADDRESS", // 127.0.0.0/8, ::1
  private: "PRIVATE_ADDRESS", // 10/8, 172.16/12, 192.168/16
  uniqueLocal: "UNIQUE_LOCAL_ADDRESS", // fc00::/7
  multicast: "MULTICAST_ADDRESS", // 224/4, ff00::/8
  reserved: "RESERVED_ADDRESS", // 240/4, 192.0.2.0/24, etc.
  carrierGradeNat: "RESERVED_ADDRESS", // 100.64/10
  ipv4Mapped: "RESERVED_ADDRESS", // ::ffff:0:0/96 — see note below
  rfc6145: "RESERVED_ADDRESS",
  rfc6052: "RESERVED_ADDRESS",
  "6to4": "RESERVED_ADDRESS",
  teredo: "RESERVED_ADDRESS",
};

/**
 * Validates a single resolved address.
 *
 * IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is handled explicitly: the library
 * reports it as `ipv4Mapped`, and naively trusting that name would let an
 * attacker reach loopback through an IPv6 literal.
 */
export function assertSafeAddress(address: string): void {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    throw new SsrfBlockedError("RESERVED_ADDRESS", `unparseable address: ${address}`);
  }

  // Unwrap IPv4-mapped IPv6 and re-check as IPv4, or ::ffff:169.254.169.254
  // would sail past the v4 metadata list.
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      assertSafeAddress(v6.toIPv4Address().toString());
      return;
    }
    if (CLOUD_METADATA_V6.has(v6.toNormalizedString())) {
      throw new SsrfBlockedError("CLOUD_METADATA_ADDRESS", address);
    }
  } else if (CLOUD_METADATA_V4.has(parsed.toString())) {
    throw new SsrfBlockedError("CLOUD_METADATA_ADDRESS", address);
  }

  const range = parsed.range();
  if (range !== "unicast") {
    // Fail closed: an unrecognised range is refused, not allowed.
    const reason = BLOCKED_RANGES[range] ?? "RESERVED_ADDRESS";
    throw new SsrfBlockedError(reason, `${address} is in range "${range}"`);
  }
}

export interface AssertSafeUrlOptions {
  /** Admin-maintained domain blocklist (§3.2 abuse controls). */
  blocklist?: ReadonlySet<string>;
  /** Injected in tests so the vector suite needs no live DNS. */
  resolver?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

async function defaultResolver(hostname: string) {
  // `all: true` is essential — resolving to a single address would miss a host
  // that returns one public and one private record (R3).
  return lookup(hostname, { all: true, verbatim: true });
}

/**
 * Validates a URL and returns the pinned target to connect to.
 *
 * Call this before EVERY navigation and, separately, for every redirect hop
 * via `assertSafeRedirect()`.
 */
export async function assertSafeUrl(
  rawUrl: string,
  options: AssertSafeUrlOptions = {},
): Promise<PinnedTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("UNPARSEABLE", rawUrl.slice(0, 200));
  }

  // R1
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new SsrfBlockedError("BAD_SCHEME", protocol);
  }

  // R1b — an empty `port` means the scheme default, which is always allowed.
  if (parsed.port !== "" && !ALLOWED_PORTS.has(parsed.port)) {
    throw new SsrfBlockedError("BAD_PORT", `${parsed.hostname}:${parsed.port}`);
  }

  // R2
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("URL_HAS_CREDENTIALS", parsed.hostname);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (options.blocklist?.has(hostname)) {
    throw new SsrfBlockedError("BLOCKLISTED_DOMAIN", hostname);
  }

  // An IP literal skips DNS entirely — validate it directly. Brackets are
  // stripped so `[::1]` is parsed rather than treated as a hostname.
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(literal)) {
    assertSafeAddress(literal);
    const parsedLiteral = ipaddr.parse(literal);
    return {
      url: parsed.toString(),
      hostname,
      pinnedAddress: literal,
      family: parsedLiteral.kind() === "ipv4" ? 4 : 6,
      allAddresses: [literal],
    };
  }

  // R3
  const resolve = options.resolver ?? defaultResolver;
  let records: Array<{ address: string; family: number }>;
  try {
    records = await resolve(hostname);
  } catch (e) {
    throw new SsrfBlockedError(
      "DNS_FAILURE",
      `${hostname}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!records || records.length === 0) {
    throw new SsrfBlockedError("NO_ADDRESSES", hostname);
  }

  // EVERY address must be safe, not just the first.
  for (const record of records) {
    assertSafeAddress(record.address);
  }

  // R4 — pin the first validated address.
  const pinned = records[0]!;
  return {
    url: parsed.toString(),
    hostname,
    pinnedAddress: pinned.address,
    family: pinned.family === 6 ? 6 : 4,
    allAddresses: records.map((r) => r.address),
  };
}

/**
 * R5/R6 — revalidate a redirect target.
 *
 * A guard applied only to the initial URL is not a guard. Every hop is a fresh,
 * attacker-controlled URL and gets the full check again.
 */
export async function assertSafeRedirect(
  location: string,
  previousUrl: string,
  hopIndex: number,
  options: AssertSafeUrlOptions = {},
): Promise<PinnedTarget> {
  if (hopIndex >= MAX_REDIRECT_HOPS) {
    throw new SsrfBlockedError(
      "REDIRECT_LIMIT",
      `${hopIndex + 1} hops exceeds ${MAX_REDIRECT_HOPS}`,
    );
  }
  // Relative redirects ("/next") resolve against the previous URL.
  const absolute = new URL(location, previousUrl).toString();
  return assertSafeUrl(absolute, options);
}
