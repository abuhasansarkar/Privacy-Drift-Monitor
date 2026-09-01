import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { unsafeGlobalClient } from "@pdm/database";
import { SsrfBlockedError, assertSafeUrl } from "@pdm/scanner/net/guard";
import {
  enqueueFreeScan,
  freeScanQueueAtCapacity,
} from "@pdm/scanner/queue/queues";
import { checkRateLimit, rateLimitKey } from "@pdm/shared";
import { domainHash, track } from "@pdm/shared/analytics";
import { verifyTurnstile } from "@pdm/shared/turnstile";
import { logger } from "@pdm/shared/logger";
import {
  UrlNormalizationError,
  normalizeWebsiteUrl,
} from "@pdm/shared/url/normalize";
import { freeScanQueue, rateLimitStore } from "@/server/services/queues";

/**
 * THE FREE PUBLIC SCANNER — PLAN.md Part III §3.2, Part X §10.3–§10.4,
 * Phase 6 task 6.5.
 *
 * ⚠️ **THE HIGHEST-RISK SURFACE IN THE PRODUCT.** It takes an arbitrary URL
 * from an unauthenticated stranger and points a real browser at it. Every
 * control below is mandatory (feature doc 18), and the ORDER is part of the
 * design, not an accident of writing:
 *
 *   1. normalize        — no network, rejects garbage for free
 *   2. SSRF guard       — THE security boundary; before anything is recorded
 *   3. blocklist        — cheap DB read, admin + automatic
 *   4. Turnstile        — a network call, so it comes after the free rejections
 *   5. IP rate limit    — per submitter
 *   6. domain limit     — GLOBAL, across all submitters
 *   7. circuit breaker  — capacity, checked last because it is the most
 *                         transient reason and the friendliest to retry
 *
 * Putting Turnstile first would mean paying Cloudflare a round trip to tell a
 * bot that its malformed URL was rejected. Putting the SSRF guard anywhere but
 * second would mean a `FreeScan` row, a rate-limit consumption or a log line
 * naming an internal address we were asked to probe.
 *
 * ⚠️ ONLY ONE REJECTION IS VAGUE. Feature doc 18: "The SSRF block message must
 * stay vague. Every other error should be specific and helpful." A precise SSRF
 * error turns this endpoint into a network-probing oracle — "connection
 * refused" versus "not a public address" maps somebody's internal range for
 * them, one submission at a time.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): `FreeScan` and `FreeScanBlocklist` are
  // PRE-TENANT (§5.9) — there is no agency to scope to, and there must not be.
  // Nothing tenant-scoped is read or written here.
  "the free scanner is pre-tenant by definition; FreeScan and its blocklist are global tables",
);

/** §3.2: "3 scans / hour, 10 / day per IP". */
const IP_HOURLY = { limit: 3, windowSeconds: 3_600 };
const IP_DAILY = { limit: 10, windowSeconds: 86_400 };
/** §3.2: "1 scan / 24 h per registrable domain, globally across all users". */
const DOMAIN_DAILY = { limit: 1, windowSeconds: 86_400 };

/** §3.2: "Results retained 7 days, then purged." */
const RESULT_TTL_DAYS = 7;

export type FreeScanRejection =
  | "INVALID_URL"
  | "BLOCKED_ADDRESS"
  | "DOMAIN_BLOCKED"
  | "CHALLENGE_FAILED"
  | "RATE_LIMITED_IP"
  | "RATE_LIMITED_DOMAIN"
  | "AT_CAPACITY";

export type FreeScanSubmission =
  | { ok: true; token: string }
  | { ok: false; code: FreeScanRejection; retryAfterSeconds?: number };

export interface SubmitInput {
  url: string;
  turnstileToken: string;
  /** From the proxy-trusted client address. May be null behind a bad proxy. */
  ip: string | null;
}

/**
 * ⚠️ THE IP IS HASHED BEFORE IT IS STORED, NEVER AFTER. §5.9 names the column
 * `ipHash`, and a privacy product that keeps raw visitor IPs on a public
 * endpoint for seven days has no standing to report on anyone else's tracking.
 * The hash is salted with a server secret so the space of IPv4 addresses — all
 * four billion of which are enumerable against an unsalted SHA-256 in
 * seconds — is not trivially reversible.
 */
function hashIp(ip: string | null): string {
  const salt = process.env.FREE_SCAN_IP_SALT ?? process.env.PORTAL_TOKEN_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip ?? "unknown"}`).digest("hex");
}

/** §3.2: "a 32-byte URL-safe random ID; the page is public but unguessable". */
function resultToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function submitFreeScan(input: SubmitInput): Promise<FreeScanSubmission> {
  // ── 1. Normalize. No network. ────────────────────────────────────────────
  let normalized;
  try {
    normalized = normalizeWebsiteUrl(input.url);
  } catch (error) {
    if (error instanceof UrlNormalizationError) return { ok: false, code: "INVALID_URL" };
    throw error;
  }

  // ── 2. SSRF. The security boundary, before anything is recorded. ─────────
  try {
    await assertSafeUrl(normalized.url);
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      /*
       * ⚠️ THE REASON IS LOGGED AND NEVER RETURNED. The log line is how we
       * investigate; the response says only "we can't scan this address".
       */
      logger.warn(
        { component: "free-scan", reason: error.reason, domain: normalized.registrableDomain },
        "free scan blocked by SSRF guard",
      );
      return { ok: false, code: "BLOCKED_ADDRESS" };
    }
    throw error;
  }

  // ── 3. Blocklist — admin-maintained and automatic. ───────────────────────
  const blocked = await db.freeScanBlocklist.findUnique({
    where: { registrableDomain: normalized.registrableDomain },
  });
  if (blocked) return { ok: false, code: "DOMAIN_BLOCKED" };

  // ── 4. Turnstile. Server-side, single-use (Cloudflare enforces the reuse). ─
  const challenge = await verifyTurnstile({
    token: input.turnstileToken,
    remoteIp: input.ip,
  });
  if (!challenge.success) {
    logger.warn({ component: "free-scan", codes: challenge.errorCodes }, "turnstile rejected");
    return { ok: false, code: "CHALLENGE_FAILED" };
  }
  if (!challenge.configured) {
    // Loud, because shipping without a secret silently removes the control.
    logger.warn(
      { component: "free-scan" },
      "TURNSTILE_SECRET_KEY is unset — the free scanner has no bot challenge",
    );
  }

  // ── 5. Per-IP limits. ────────────────────────────────────────────────────
  const store = rateLimitStore();
  const ipKey = hashIp(input.ip);
  const hourly = await checkRateLimit(store, rateLimitKey("freescan-ip-h", ipKey), IP_HOURLY);
  if (!hourly.allowed) {
    return { ok: false, code: "RATE_LIMITED_IP", retryAfterSeconds: hourly.resetSeconds };
  }
  const daily = await checkRateLimit(store, rateLimitKey("freescan-ip-d", ipKey), IP_DAILY);
  if (!daily.allowed) {
    return { ok: false, code: "RATE_LIMITED_IP", retryAfterSeconds: daily.resetSeconds };
  }

  /*
   * ── 6. Per-domain limit — GLOBAL, not per IP. ────────────────────────────
   *
   * ⚠️ THIS IS THE CONTROL THAT PROTECTS OTHER PEOPLE'S WEBSITES, and feature
   * doc 18 calls it out as a trap: "Domain rate limiting is global, not per-IP
   * — otherwise a distributed abuser hammers one target through us." Per-IP
   * limits protect our capacity; only a global per-domain limit stops us being
   * turned into an amplifier pointed at a third party.
   */
  const domainLimit = await checkRateLimit(
    store,
    rateLimitKey("freescan-domain", normalized.registrableDomain),
    DOMAIN_DAILY,
  );
  if (!domainLimit.allowed) {
    return {
      ok: false,
      code: "RATE_LIMITED_DOMAIN",
      retryAfterSeconds: domainLimit.resetSeconds,
    };
  }

  // ── 7. Capacity. ─────────────────────────────────────────────────────────
  const queue = freeScanQueue();
  if (await freeScanQueueAtCapacity(queue)) {
    return { ok: false, code: "AT_CAPACITY" };
  }

  const token = resultToken();
  const scan = await db.freeScan.create({
    data: {
      token,
      url: normalized.url,
      registrableDomain: normalized.registrableDomain,
      ipHash: ipKey,
      status: "QUEUED",
      expiresAt: new Date(Date.now() + RESULT_TTL_DAYS * 86_400_000),
    },
  });

  await enqueueFreeScan(queue, {
    freeScanId: scan.id,
    url: normalized.url,
    registrableDomain: normalized.registrableDomain,
  });

  /*
   * ⚠️ §9.6 SENDS A HASH, NOT THE DOMAIN. "Domains are hashed where they
   * appear... Our own product must meet the standard we sell." A lead-gen
   * funnel that quietly builds a list of every website anyone pasted into our
   * scanner is exactly the behaviour this product exists to report on.
   */
  void track("free_scan_submitted", {
    domain_hash: domainHash(normalized.registrableDomain),
  });

  return { ok: true, token };
}
