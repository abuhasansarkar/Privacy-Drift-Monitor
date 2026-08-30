import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { SsrfBlockedError, assertSafeUrl } from "@pdm/scanner/net/guard";
import type { UrlValidationResult } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { childLogger } from "@pdm/shared/logger";
import {
  UrlNormalizationError,
  normalizeWebsiteUrl,
  type NormalizedUrl,
} from "@pdm/shared/url/normalize";
import { canAddWebsite } from "@/server/entitlements";

/**
 * URL VALIDATION SERVICE — §6.4, §10.3, feature 04.
 *
 * The single implementation of the pre-flight, shared by the wizard's
 * `POST /api/websites/validate` and by `createWebsite()`.
 *
 * ⚠️ IT IS SHARED ON PURPOSE, AND THE ACTION MUST RE-RUN IT. The wizard sends
 * a URL it has already had validated, and the obvious shortcut — trust the
 * `normalizedUrl` that came back — hands an attacker a way to skip the SSRF
 * guard entirely by posting straight to the action with any address they like.
 * Validation is not a step the client can have completed on the server's
 * behalf, so `createWebsite()` starts here every time.
 *
 * ORDER MATTERS and is not interchangeable:
 *   1. normalize     — canonical form + registrable domain (PSL). No network.
 *   2. assertSafeUrl — THE SECURITY BOUNDARY (§10.3). Resolves DNS and pins.
 *   3. duplicate + entitlement — cheap DB checks, only once the URL is allowed
 *
 * ⚠️ Passing this is NOT permission to fetch anything. The scanner re-runs
 * `assertSafeUrl()` before every navigation and `assertSafeRedirect()` on every
 * hop — a guard applied once would be defeated by a DNS record that changes
 * between validation and the scan (§10.3 R4/R5).
 */

export type ValidationOutcome =
  | { ok: true; normalized: NormalizedUrl; result: UrlValidationResult }
  | { ok: false; result: UrlValidationResult };

function failure(
  code: UrlValidationResult["code"],
  message: string,
): ValidationOutcome {
  return {
    ok: false,
    result: {
      ok: false,
      normalizedUrl: null,
      registrableDomain: null,
      upgradedToHttps: false,
      redirectsTo: null,
      code,
      message,
    },
  };
}

export async function validateWebsiteUrl(
  ctx: { agencyId: string; userId: string },
  rawUrl: string,
): Promise<ValidationOutcome> {
  const log = childLogger({ agencyId: ctx.agencyId, userId: ctx.userId });

  // ── 1. Normalize ────────────────────────────────────────────────────────
  let normalized: NormalizedUrl;
  try {
    normalized = normalizeWebsiteUrl(rawUrl);
  } catch (error) {
    if (error instanceof UrlNormalizationError) {
      // `message` carries the internal reason; `userMessage` is the safe one.
      const code = error.message.startsWith("URL_HAS_CREDENTIALS")
        ? "URL_HAS_CREDENTIALS"
        : error.message.startsWith("NO_REGISTRABLE_DOMAIN")
          ? "NO_REGISTRABLE_DOMAIN"
          : error.message.startsWith("BAD_SCHEME")
            ? "UNSUPPORTED_SCHEME"
            : "INVALID_URL";
      return failure(code, error.userMessage);
    }
    throw error;
  }

  // ── 2. SSRF boundary ────────────────────────────────────────────────────
  try {
    await assertSafeUrl(normalized.url);
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      // The reason is a SECURITY LOG line and never leaves the server (R7).
      // Returning it would turn this into a network probe oracle.
      log.warn(
        { reason: error.reason, detail: error.detail, host: normalized.host },
        "url rejected by ssrf guard",
      );
      return failure("URL_NOT_ALLOWED", error.userMessage);
    }
    throw error;
  }

  // ── 3. Duplicate and entitlement ────────────────────────────────────────
  const repos = repositoriesFor(ctx.agencyId);
  if (await repos.websites.findByUrl(normalized.url)) {
    return failure("DUPLICATE", t("urlError.duplicate"));
  }

  // Archived sites do not count towards the plan limit (§9.2) — which is what
  // `countActive()` encodes, so the rule lives in one place.
  const allowance = await canAddWebsite(ctx.agencyId, await repos.websites.countActive());
  if (!allowance.allowed) {
    return failure("ENTITLEMENT_EXCEEDED", t("urlError.entitlementExceeded"));
  }

  return {
    ok: true,
    normalized,
    result: {
      ok: true,
      normalizedUrl: normalized.url,
      registrableDomain: normalized.registrableDomain,
      upgradedToHttps: normalized.upgradedToHttps,
      // Reachability and the redirect target need an actual HTTP fetch through
      // the pinned address. That belongs to the scanner's fetch path (Phase 2),
      // so this stays null rather than being guessed here.
      redirectsTo: null,
      code: "OK",
      message: null,
    },
  };
}
