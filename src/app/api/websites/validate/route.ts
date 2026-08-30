import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { SsrfBlockedError, assertSafeUrl } from "@pdm/scanner/net/guard";
import {
  UrlNormalizationError,
  normalizeWebsiteUrl,
} from "@pdm/shared/url/normalize";
import { childLogger } from "@pdm/shared/logger";
import type { UrlValidationResult } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { requirePermission } from "@/server/auth/context";
import { canAddWebsite } from "@/server/entitlements";

/**
 * URL VALIDATION — §6.4, Phase 1 task 1.7, feature 04.
 *
 * The pre-flight the Add Website wizard runs before anything is created. It is
 * the FIRST call site of the SSRF guard, which until now existed with a test
 * suite and no caller.
 *
 * ORDER MATTERS and is not interchangeable:
 *   1. Zod           — shape only, no network
 *   2. normalize     — canonical form + registrable domain (PSL). No network.
 *   3. assertSafeUrl — THE SECURITY BOUNDARY (§10.3). Resolves DNS and pins.
 *   4. duplicate + entitlement — cheap DB checks, only once the URL is allowed
 *
 * ⚠️ Passing this route is NOT permission to fetch anything. The scanner
 * re-runs `assertSafeUrl()` before every navigation and `assertSafeRedirect()`
 * on every hop — a guard applied once, here, would be trivially defeated by a
 * DNS record that changes between this request and the scan (§10.3 R4/R5).
 *
 * ⚠️ Every rejection returns HTTP 200 with `ok: false` and a code. The failure
 * is about the submitted address, not about this request, and the wizard has
 * one rendering path for all of them.
 */

const bodySchema = z.object({ url: z.string().trim().min(1).max(2048) });

function reject(
  code: UrlValidationResult["code"],
  message: string,
  extra: Partial<UrlValidationResult> = {},
): Response {
  const body: UrlValidationResult = {
    ok: false,
    normalizedUrl: null,
    registrableDomain: null,
    upgradedToHttps: false,
    redirectsTo: null,
    code,
    message,
    ...extra,
  };
  return Response.json(body);
}

export async function POST(request: Request) {
  // Authorization is re-checked here and not inherited from the proxy — this is
  // a route handler, but the same rule that governs Server Actions applies:
  // the gate lives with the thing being protected (§6.1).
  const ctx = await requirePermission("website:create");
  const log = childLogger({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    requestId: crypto.randomUUID(),
  });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return reject("INVALID_URL", t("urlError.invalid"));
  }

  // ── 2. Normalize ────────────────────────────────────────────────────────
  let normalized;
  try {
    normalized = normalizeWebsiteUrl(parsed.data.url);
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
      return reject(code, error.userMessage);
    }
    throw error;
  }

  // ── 3. SSRF boundary ────────────────────────────────────────────────────
  try {
    await assertSafeUrl(normalized.url);
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      // The reason is a SECURITY LOG line and never leaves the server (R7).
      // Returning it would turn this endpoint into a network probe oracle.
      log.warn(
        { reason: error.reason, detail: error.detail, host: normalized.host },
        "url rejected by ssrf guard",
      );
      return reject("URL_NOT_ALLOWED", error.userMessage);
    }
    throw error;
  }

  // ── 4. Duplicate and entitlement ────────────────────────────────────────
  const repos = repositoriesFor(ctx.agencyId);
  const existing = await repos.websites.findByUrl(normalized.url);
  if (existing) {
    return reject("DUPLICATE", t("urlError.duplicate"));
  }

  const currentCount = await repos.db.website.count({ where: { archivedAt: null } });
  const allowance = await canAddWebsite(ctx.agencyId, currentCount);
  if (!allowance.allowed) {
    return reject("ENTITLEMENT_EXCEEDED", t("urlError.entitlementExceeded"));
  }

  const body: UrlValidationResult = {
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
  };
  return Response.json(body);
}
